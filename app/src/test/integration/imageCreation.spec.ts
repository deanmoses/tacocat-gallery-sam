import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { findImage, findSubAlbum } from '../../lib/gallery_client/AlbumObject';
import {
    getNameFromPath,
    getParentFromPath,
    isValidAlbumPath,
    isValidImagePath,
} from '../../lib/gallery_path_utils/galleryPathUtils';
import { assertDynamoDBItemDoesNotExist, cleanUpAlbum } from './helpers/albumHelpers';
import { reallyGetNameFromPath } from './helpers/pathHelpers';
import { assertOriginalImageDoesNotExist, originalImageExists, uploadImage } from './helpers/s3ImageHelper';

const yearPath = '/1704/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}09-02/`;
const imagePath = `${albumPath}image1.jpg`;

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);

    await Promise.all([
        assertDynamoDBItemDoesNotExist(yearPath),
        assertDynamoDBItemDoesNotExist(albumPath),
        assertOriginalImageDoesNotExist(imagePath),
    ]);

    await uploadImage('image.jpg', imagePath);
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered

    await Promise.all([
        updateAlbum(albumPath, { published: true }),
        updateAlbum(getParentFromPath(albumPath), { published: true }),
    ]);
}, 25000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbum(albumPath);
    await cleanUpAlbum(yearPath);
});

test('Parent album was created', async () => {
    if (!(await itemExists(albumPath))) throw new Error(`Album [${albumPath}] does not exist`);
});

test('Grandparent album was created', async () => {
    if (!(await itemExists(yearPath))) throw new Error(`Album [${yearPath}] does not exist`);
});

test('Album contains image', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw 'no album';
    const imageName = reallyGetNameFromPath(imagePath);
    const image = findImage(album, imageName);
    if (!image) throw new Error(`Did not find child image`);
    if (!image.versionId) throw new Error(`Image [${imageName}] has no versionId`);
    expect(image.parentPath).toBe(albumPath);
    expect(image.itemName).toBe(imageName);
    expect(image.title).toBe('Image Title');
    expect(image.tags?.sort()).toEqual(['test1', 'test2', 'test3'].sort());
});

test("Image was set as album's thumb", async () => {
    const parentAlbum = await getAlbumAndChildren(getParentFromPath(albumPath));
    if (!parentAlbum) throw new Error(`Parent album [${getParentFromPath(albumPath)}] not found`);
    const album = findSubAlbum(parentAlbum, getNameFromPath(albumPath));
    if (!album) throw new Error(`Album [${albumPath}] not found in parent [${getParentFromPath(albumPath)}]`);
    expect(album?.thumbnail?.path).toBe(imagePath);
    if (!album?.thumbnail?.versionId) throw new Error(`Album [${albumPath}] thumbnail [${imagePath}] has no versionId`);
});

test('Delete image', async () => {
    await expect(deleteImage(imagePath)).resolves.not.toThrow();
});

test('Album should not contain deleted image', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw 'no album';
    const imageName = reallyGetNameFromPath(imagePath);
    const image = findImage(album, imagePath);
    if (!!image) throw new Error(`Image [${imageName}] should not exist in album [${albumPath}]`);
});

test('Image should no longer be album thumb', async () => {
    const album = await getAlbumAndChildren(albumPath);
    expect(album?.thumbnail?.path).toBeUndefined();
});

test('Original images bucket should no longer contain image', async () => {
    if (await originalImageExists(imagePath)) throw new Error(`[${imagePath}] should not exist in originals bucket`);
});
