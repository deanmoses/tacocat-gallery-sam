import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { getAlbum, getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { recutThumbnail } from '../../lib/gallery/recutThumbnail/recutThumbnail';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { findSubAlbum } from '../../lib/gallery_client/AlbumObject';
import {
    getNameFromPath,
    getParentFromPath,
    isValidAlbumPath,
    isValidImagePath,
} from '../../lib/gallery_path_utils/galleryPathUtils';
import { assertDynamoDBItemExists, cleanUpAlbum } from './helpers/albumHelpers';
import { assertOriginalImageExists, uploadImage } from './helpers/s3ImageHelper';

const albumPath = '/1702/10-04/'; // unique to this suite to prevent pollution
const imagePath1 = `${albumPath}image1.jpg`;
const imagePath2 = `${albumPath}image2.jpg`;
const cropInPct = { x: 0, y: 0, width: 100, height: 100 };
const cropInPx = { x: 0, y: 0, width: 220, height: 212 };

beforeAll(async () => {
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath1)).toBe(true);
    expect(isValidImagePath(imagePath2)).toBe(true);

    await Promise.all([uploadImage('image.jpg', imagePath1), uploadImage('image.jpg', imagePath2)]);

    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered

    await Promise.all([
        updateAlbum(albumPath, { published: true }),
        updateAlbum(getParentFromPath(albumPath), { published: true }),
        assertDynamoDBItemExists(albumPath),
        assertDynamoDBItemExists(getParentFromPath(albumPath)),
        assertDynamoDBItemExists(imagePath1),
        assertDynamoDBItemExists(imagePath2),
        assertOriginalImageExists(imagePath1),
        assertOriginalImageExists(imagePath2),
    ]);
}, 10000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbum(albumPath);
    await cleanUpAlbum(getParentFromPath(albumPath));
}, 10000 /* increase Jest's timeout */);

test('Should fail to set thumb to nonexistent image', async () => {
    await expect(setAlbumThumbnail(albumPath, '/1949/10-04/no_such_image.jpg')).rejects.toThrow(/found/i);
});

test('Set thumb on day album', async () => {
    await expect(setAlbumThumbnail(albumPath, imagePath2)).resolves.not.toThrow();
});

test('Year album shows day thumb', async () => {
    const yearPath = getParentFromPath(albumPath);
    const yearAlbum = await getAlbumAndChildren(yearPath);
    if (!yearAlbum) throw new Error(`No album [${yearPath}]}]`);
    const albumName = getNameFromPath(albumPath);
    if (!albumName) throw new Error(`No album name in path [${albumPath}]`);
    const album = findSubAlbum(yearAlbum, albumName);
    if (!album) throw new Error(`No album [${albumPath}] in year [${yearAlbum}]`);
    if (!album?.thumbnail) throw new Error(`Album [${albumPath}] has no thumbnail`);
    if (!album.thumbnail.versionId) throw new Error(`Album [${albumPath}] has no thumbnail versionId`);
    expect(album.thumbnail.path).toBe(imagePath2);
    expect(album.thumbnail.crop).toBeUndefined();
});

test('Set thumb on year', async () => {
    const grandparentPath = getParentFromPath(albumPath);
    await expect(setAlbumThumbnail(grandparentPath, imagePath2)).resolves.not.toThrow();
    const album = await getAlbum(grandparentPath);
    if (!album?.thumbnail) throw new Error('Expected album to have thumbnail');
    expect(album.thumbnail.path).toBe(imagePath2);
    expect(album.thumbnail.crop).toBeUndefined();
});

test('Root album shows year thumb', async () => {
    const rootAlbum = await getAlbumAndChildren('/');
    if (!rootAlbum) throw new Error('No root album');
    const yearPath = getParentFromPath(albumPath);
    const yearName = getNameFromPath(yearPath);
    if (!yearName) throw new Error(`Could not find year name in path [${yearPath}]`);
    const album = findSubAlbum(rootAlbum, yearName);
    if (!album) throw new Error(`No album on root with path [${yearPath}]`);
    if (!album.thumbnail) throw new Error('Expected album to have thumbnail');
    expect(album.thumbnail.path).toBe(imagePath2);
    expect(album.thumbnail.crop).toBeUndefined();
});

test('Recut thumb', async () => {
    await expect(recutThumbnail(imagePath2, cropInPct)).resolves.not.toThrow();
});

test('Thumb on grandparent honors recut [THIS FAIL IS VALID]', async () => {
    const grandparentPath = getParentFromPath(albumPath);
    const album = await getAlbumAndChildren(grandparentPath);
    if (!album) throw new Error(`No grandparent album [${grandparentPath}]}]`);
    if (!album?.thumbnail) throw new Error(`Expected album [${grandparentPath}] to have thumbnail`);
    if (!album.thumbnail.path) throw new Error(`Expected album [${grandparentPath}] to have thumbnail path`);
    expect(album.thumbnail.path).toBe(imagePath2);
    if (!album.thumbnail.crop) throw new Error(`Expected album [${grandparentPath}] to have thumbnail crop`);
    expect(album.thumbnail.crop).toEqual(cropInPx);
});

test('Thumb on year displaying days honors recut', async () => {
    const grandparentPath = getParentFromPath(albumPath);
    const grandParentAlbum = await getAlbumAndChildren(grandparentPath);
    if (!grandParentAlbum) throw new Error(`No grandparent album [${grandparentPath}]}]`);
    const albumName = getNameFromPath(albumPath);
    if (!albumName) throw new Error(`No album name in path [${albumPath}]`);
    const album = findSubAlbum(grandParentAlbum, albumName);
    if (!album) throw new Error(`No album [${albumPath}] in year [${grandParentAlbum}]`);
    if (!album?.thumbnail) throw new Error(`Expected album [${albumPath}] to have thumbnail`);
    expect(album.thumbnail.path).toBe(imagePath2);
    expect(album.thumbnail.crop).toEqual(cropInPx);
});

test('Thumb on root displaying years honors recut', async () => {
    const rootAlbum = await getAlbumAndChildren('/');
    if (!rootAlbum) throw new Error('No root album');
    const yearPath = getParentFromPath(albumPath);
    const yearName = getNameFromPath(yearPath);
    if (!yearName) throw new Error(`Could not find year name in path [${yearPath}]`);
    const album = findSubAlbum(rootAlbum, yearName);
    if (!album) throw new Error(`No album on root with path [${yearPath}]`);
    if (!album.thumbnail) throw new Error('Expected album to have thumbnail');
    expect(album.thumbnail.path).toBe(imagePath2);
    expect(album.thumbnail.crop).toEqual(cropInPx);
});

test('Delete image', async () => {
    await expect(deleteImage(imagePath2)).resolves.not.toThrow();
});

test('Should no longer be thumb of parent', async () => {
    const album = await getAlbum(albumPath);
    expect(album?.thumbnail).toBeUndefined();
    const grandparentPath = getParentFromPath(albumPath);
    const grandparentAlbum = await getAlbum(grandparentPath);
    expect(grandparentAlbum?.thumbnail).toBeUndefined();
});

test('Should no longer be thumb of grandparent', async () => {
    const album = await getAlbum(albumPath);
    expect(album?.thumbnail).toBeUndefined();
    const grandparentPath = getParentFromPath(albumPath);
    const grandparentAlbum = await getAlbum(grandparentPath);
    expect(grandparentAlbum?.thumbnail).toBeUndefined();
});
