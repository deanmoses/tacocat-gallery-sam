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

beforeAll(async () => {
    imageName = `image1_${Date.now()}.jpg`; // unique to this test run to prevent test from not being able to run again on failure to clean up properly
    imagePath = `${oldAlbumPath}${imageName}`; // unique to this test run to prevent test from not being able to run again on failure to clean up properly

    assertIsValidYearAlbumPath(yearAlbumPath);
    assertIsValidAlbumPath(oldAlbumPath);
    assertIsValidAlbumPath(newAlbumPath);
    assertIsValidAlbumPath(anotherAlbumPath);
    assertIsValidImagePath(imagePath);

    await assertDynamoDBItemDoesNotExist(oldAlbumPath);
    await assertDynamoDBItemDoesNotExist(newAlbumPath);
    await assertDynamoDBItemDoesNotExist(anotherAlbumPath);
    await assertDynamoDBItemDoesNotExist(imagePath);

    await uploadImage('image.jpg', imagePath);
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
    await assertDynamoDBItemExists(oldAlbumPath);
    await assertDynamoDBItemExists(imagePath);
    await assertOriginalImageExists(imagePath);

    await createAlbum(anotherAlbumPath);

    // Set image as thumbnail of immediate parent album
    await setAlbumThumbnail(
        oldAlbumPath,
        imagePath,
        false /* Since the first uploaded image may have set this, don't error */,
    );

    // Set image as thumbnail of grandparent album
    await setAlbumThumbnail(
        getParentFromPath(oldAlbumPath),
        imagePath,
        false /* Since the first uploaded image may have set this, don't error */,
    );
}, 25000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbum(anotherAlbumPath);
    await cleanUpAlbum(newAlbumPath);
    await cleanUpAlbumAndParents(oldAlbumPath);
}, 20000 /* increase Jest's timeout */);

test('Cannot rename to same name', async () => {
    await expect(renameAlbum(oldAlbumPath, oldAlbumName)).rejects.toThrow(/same/i);
});

test('Cannot rename to same name as an existing album', async () => {
    await expect(renameAlbum(oldAlbumPath, anotherAlbumName)).rejects.toThrow(/exists/i);
});

test('Do the rename', async () => {
    await renameAlbum(oldAlbumPath, newAlbumName);
});

test('Originals bucket should not contain old image', async () => {
    await expect(originalImageExists(imagePath)).resolves.toBe(false);
});

test('Originals bucket should contain new image', async () => {
    await expect(originalImageExists(newAlbumPath + imageName)).resolves.toBe(true);
});

test('GetAlbum() should not find old album', async () => {
    const album = await getAlbumAndChildren(oldAlbumPath);
    if (!!album) throw new Error(`Was able to retrieve old album [${oldAlbumPath}]`);
});

test('GetAlbum() should find new album', async () => {
    const album = await getAlbumAndChildren(newAlbumPath);
    if (!album) throw new Error(`No new album [${newAlbumPath}]`);
    if (!album?.children) throw new Error(`New album [${newAlbumPath}] has no children`);

    // Ensure album contains image
    const image = findImage(album, imageName);
    if (!image) throw new Error(`Album does not contain image [${imageName}]`);
    expect(image.itemName).toBe(imageName);
    expect(image.parentPath).toBe(newAlbumPath);

    // Ensure album's thumbnail entry reflects rename
    const newImagePath = newAlbumPath + imageName;
    expect(album.album?.thumbnail?.path).toBe(newImagePath);
});

test("Grandparent album's thumbnail entry should reflect the image rename", async () => {
    const album = await getAlbum(getParentFromPath(newAlbumPath));
    if (!album) throw new Error('no grandparent album');
    const newImagePath = newAlbumPath + imageName;
    expect(album?.thumbnail?.path).toBe(newImagePath);
});
