import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { getAlbum } from '../../lib/gallery/getAlbum/getAlbum';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { renameAlbum } from '../../lib/gallery/renameAlbum/renameAlbum';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { findImage } from '../../lib/gallery_client/AlbumObject';
import { getParentFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import {
    assertDynamoDBItemDoesNotExist,
    assertDynamoDBItemExists,
    cleanUpAlbum,
    cleanUpAlbumAndParents,
    getAlbumAndChildrenOrThrow,
} from './helpers/albumHelpers';
import { assertIsValidAlbumPath, assertIsValidImagePath, assertIsValidYearAlbumPath } from './helpers/pathHelpers';
import { assertOriginalImageExists, originalImageExists, uploadImage } from './helpers/s3ImageHelper';

const yearAlbumPath = '/1711/'; // should be unique to this suite to prevent pollution
const oldAlbumName = '01-17';
const newAlbumName = '01-18';
const anotherAlbumName = '01-19';
const oldAlbumPath = `${yearAlbumPath}${oldAlbumName}/`;
const newAlbumPath = `${yearAlbumPath}${newAlbumName}/`;
const anotherAlbumPath = `${yearAlbumPath}${anotherAlbumName}/`;
let imageName: string;
let imagePath: string;
let oldImageVersionId: string;
let image2Path: string;
let image3Path: string;

beforeAll(async () => {
    imageName = `image1_${Date.now()}.jpg`; // unique to this test run to prevent test from not being able to run again on failure to clean up properly
    imagePath = `${oldAlbumPath}${imageName}`; // unique to this test run to prevent test from not being able to run again on failure to clean up properly
    image2Path = `${oldAlbumPath}image2_${Date.now()}.jpg`;
    image3Path = `${oldAlbumPath}image3_${Date.now()}.jpg`;

    assertIsValidYearAlbumPath(yearAlbumPath);
    assertIsValidAlbumPath(oldAlbumPath);
    assertIsValidAlbumPath(newAlbumPath);
    assertIsValidAlbumPath(anotherAlbumPath);
    assertIsValidImagePath(imagePath);
    assertIsValidImagePath(image2Path);
    assertIsValidImagePath(image3Path);
    await Promise.all([
        assertDynamoDBItemDoesNotExist(oldAlbumPath),
        assertDynamoDBItemDoesNotExist(newAlbumPath),
        assertDynamoDBItemDoesNotExist(anotherAlbumPath),
        assertDynamoDBItemDoesNotExist(imagePath),
        assertDynamoDBItemDoesNotExist(image2Path),
        assertDynamoDBItemDoesNotExist(image3Path),
    ]);
    await Promise.all([
        uploadImage('image.jpg', imagePath),
        uploadImage('image.jpg', image2Path),
        uploadImage('image.jpg', image3Path),
    ]);
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
    await Promise.all([
        assertDynamoDBItemExists(oldAlbumPath),
        assertDynamoDBItemExists(imagePath),
        assertOriginalImageExists(imagePath),
        assertDynamoDBItemExists(image2Path),
        assertOriginalImageExists(image2Path),
        assertDynamoDBItemExists(image3Path),
        assertOriginalImageExists(image3Path),
    ]);
    await Promise.all([
        createAlbum(anotherAlbumPath),
        setAlbumThumbnail(oldAlbumPath, imagePath),
        setAlbumThumbnail(getParentFromPath(oldAlbumPath), imagePath),
    ]);
}, 25000 /* increase Jest's timeout */);

afterAll(async () => {
    await Promise.allSettled([cleanUpAlbum(anotherAlbumPath), cleanUpAlbum(newAlbumPath)]);
    await cleanUpAlbumAndParents(oldAlbumPath);
}, 20000 /* increases Jest's timeout */);

test('Cannot rename to same name', async () => {
    await expect(renameAlbum(oldAlbumPath, oldAlbumName)).rejects.toThrow(/same/i);
});

test('Cannot rename to same name as an existing album', async () => {
    await expect(renameAlbum(oldAlbumPath, anotherAlbumName)).rejects.toThrow(/exists/i);
});

test('Rename should not fail', async () => {
    await renameAlbum(oldAlbumPath, newAlbumName);
}, 10000 /* increases Jest's timeout */);

test('Originals bucket should not contain old image', async () => {
    await expect(originalImageExists(imagePath)).resolves.toBe(false);
});

test('Originals bucket should contain new image', async () => {
    await expect(originalImageExists(newAlbumPath + imageName)).resolves.toBe(true);
});

test('Should not find old album', async () => {
    const album = await getAlbumAndChildren(oldAlbumPath);
    if (!!album) throw new Error(`Was able to retrieve old album [${oldAlbumPath}]`);
});

test('Should find new album', async () => {
    const album = await getAlbumAndChildrenOrThrow(newAlbumPath, true /* include unpublished album */);
    if (!album?.children) throw new Error(`New album [${newAlbumPath}] has no children`);

    // Ensure album contains image
    const image = findImage(album, imageName);
    if (!image) throw new Error(`Album does not contain image [${imageName}]`);
    expect(image.itemName).toBe(imageName);
    expect(image.parentPath).toBe(newAlbumPath);
    const newImageVersionId = image.versionId;
    if (!newImageVersionId) throw new Error(`No version ID found for image [${imageName}]`);
    expect(newImageVersionId).not.toBe(oldImageVersionId);

    // Ensure album's thumbnail entry reflects rename
    const newImagePath = newAlbumPath + imageName;
    expect(album?.thumbnail?.path).toBe(newImagePath);

    // Ensure other images are still there
    expect(album.children.length).toBe(3);
});

test("Grandparent album's thumbnail entry should reflect the image rename", async () => {
    const album = await getAlbum(getParentFromPath(newAlbumPath), true /* include unpublished album */);
    if (!album) throw new Error('no grandparent album');
    const newImagePath = newAlbumPath + imageName;
    expect(album?.thumbnail?.path).toBe(newImagePath);
});
