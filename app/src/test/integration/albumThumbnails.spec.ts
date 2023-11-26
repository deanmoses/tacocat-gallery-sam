import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { getAlbum, getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { recutThumbnail } from '../../lib/gallery/recutThumbnail/recutThumbnail';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { findSubAlbum } from '../../lib/gallery_client/AlbumObject';
import {
    getNameFromPath,
    getParentFromPath,
    isValidAlbumPath,
    isValidImagePath,
} from '../../lib/gallery_path_utils/galleryPathUtils';
import { assertDynamoDBItemExists, cleanUpAlbum } from './helpers/albumHelpers';
import { assertOriginalImageExists, uploadImage } from './helpers/s3ImageHelper';

const albumPath = '/1949/10-04/'; // unique to this suite to prevent pollution
const imagePath1 = `${albumPath}image1.jpg`;
const imagePath2 = `${albumPath}image2.jpg`;
const cropInPct = { x: 0, y: 0, width: 100, height: 100 };
const cropInPx = { x: 0, y: 0, width: 220, height: 212 };

beforeAll(async () => {
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath1)).toBe(true);
    expect(isValidImagePath(imagePath2)).toBe(true);

    await uploadImage('image.jpg', imagePath1);
    await uploadImage('image.jpg', imagePath2);

    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered

    await assertDynamoDBItemExists(albumPath);
    await assertDynamoDBItemExists(getParentFromPath(albumPath));
    await assertDynamoDBItemExists(imagePath1);
    await assertDynamoDBItemExists(imagePath2);

    await assertOriginalImageExists(imagePath1);
    await assertOriginalImageExists(imagePath2);
}, 10000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbum(albumPath);
});

test('Should fail to set thumb to nonexistent image', async () => {
    await expect(setAlbumThumbnail(albumPath, '/1949/10-04/no_such_image.jpg')).rejects.toThrow(/found/i);
});

test('Set thumb on parent', async () => {
    await expect(setAlbumThumbnail(albumPath, imagePath2)).resolves.not.toThrow();
    const album = await getAlbum(albumPath);
    if (!album?.thumbnail) throw new Error('Expected album to have thumbnail');
    expect(album.thumbnail.path).toBe(imagePath2);
    expect(album.thumbnail.crop).toBeUndefined();
});

test('Set thumb on grandparent', async () => {
    const grandparentPath = getParentFromPath(albumPath);
    await expect(setAlbumThumbnail(grandparentPath, imagePath2)).resolves.not.toThrow();
    const album = await getAlbum(grandparentPath);
    if (!album?.thumbnail) throw new Error('Expected album to have thumbnail');
    expect(album.thumbnail.path).toBe(imagePath2);
    expect(album.thumbnail.crop).toBeUndefined();
});

test('Recut thumb', async () => {
    await expect(recutThumbnail(imagePath2, cropInPct)).resolves.not.toThrow();
});

test('Thumb on parent honors recut', async () => {
    const album = await getAlbumAndChildren(albumPath);
    console.log(`Test: thumb on parent honors recut.  Album: `, album);
    if (!album?.thumbnail) throw new Error('Expected album to have thumbnail');
    expect(album.thumbnail.path).toBe(imagePath2);
    expect(album.thumbnail.crop).toEqual(cropInPx);
});

test('Thumb on grandparent', async () => {
    const grandparentPath = getParentFromPath(albumPath);
    const album = await getAlbumAndChildren(grandparentPath);
    if (!album?.thumbnail) throw new Error('Expected album to have thumbnail');
    expect(album.thumbnail.path).toBe(imagePath2);
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
    const grandparentPath = getParentFromPath(albumPath);
    const grandparentName = getNameFromPath(grandparentPath);
    if (!grandparentName) throw new Error(`No grandparent name in path [${grandparentPath}]`);
    const album = findSubAlbum(rootAlbum, grandparentName);
    if (!album) throw new Error(`No album on root with path [${grandparentPath}]`);
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
