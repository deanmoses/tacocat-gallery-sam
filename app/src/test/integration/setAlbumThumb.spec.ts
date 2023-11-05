import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { getAlbum } from '../../lib/gallery/getAlbum/getAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';
import { cleanUpAlbum } from './helpers/albumHelpers';
import { imageExistsInOriginalsBucket, uploadImage } from './helpers/s3ImageHelper';

const albumPath = '/1949/10-04/'; // unique to this suite to prevent pollution
const imagePath1 = `${albumPath}image1.jpg`;
const imagePath2 = `${albumPath}image2.jpg`;

beforeAll(async () => {
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath1)).toBe(true);
    expect(isValidImagePath(imagePath2)).toBe(true);

    if (await itemExists(albumPath)) throw new Error(`Album [${albumPath}] cannot exist at start of this test suite`);

    await createAlbum(albumPath);
    await uploadImage('image.jpg', imagePath1);
    await uploadImage('image.jpg', imagePath2);

    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered

    await expect(itemExists(albumPath)).resolves.toBe(true);
    await expect(itemExists(imagePath1)).resolves.toBe(true);
    await expect(itemExists(imagePath2)).resolves.toBe(true);

    await expect(imageExistsInOriginalsBucket(imagePath1)).resolves.toBe(true);
    await expect(imageExistsInOriginalsBucket(imagePath2)).resolves.toBe(true);
}, 10000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbum(albumPath);
});

test('Invalid Thumbnail', async () => {
    await expect(setAlbumThumbnail(albumPath, '/1949/10-04/no_such_image.jpg')).rejects.toThrow(/found/i);
});

test('Set Thumbnail - happy path', async () => {
    await expect(setAlbumThumbnail(albumPath, imagePath2)).resolves.not.toThrow();
    const album = await getAlbum(albumPath);
    expect(album?.thumbnail?.path).toBe(imagePath2);
});

test('Delete Image Should Unset Thumbnail', async () => {
    await expect(deleteImage(imagePath2)).resolves.not.toThrow();
    const album = await getAlbum(albumPath);
    expect(album?.thumbnail).toBeUndefined();
});
