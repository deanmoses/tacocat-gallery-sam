import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { getAlbum } from '../../lib/gallery/getAlbum/getAlbum';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { getParentFromPath } from '../../lib/gallery_path_utils/getParentFromPath';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';
import { assertDynamoDBItemExists, cleanUpAlbum } from './helpers/albumHelpers';
import { assertOriginalImageExists, uploadImage } from './helpers/s3ImageHelper';

const albumPath = '/1949/10-04/'; // unique to this suite to prevent pollution
const imagePath1 = `${albumPath}image1.jpg`;
const imagePath2 = `${albumPath}image2.jpg`;

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
    expect(album?.thumbnail?.path).toBe(imagePath2);
});

test('Set thumb on grandparent', async () => {
    const grandparentPath = getParentFromPath(albumPath);
    await expect(setAlbumThumbnail(grandparentPath, imagePath2)).resolves.not.toThrow();
    const album = await getAlbum(grandparentPath);
    expect(album?.thumbnail?.path).toBe(imagePath2);
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
