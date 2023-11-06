import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { getAlbum } from '../../lib/gallery/getAlbum/getAlbum';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { getParentFromPath } from '../../lib/gallery_path_utils/getParentFromPath';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';
import { assertItemExists, cleanUpAlbum } from './helpers/albumHelpers';
import { assertImageExistsInOriginalsBucket, uploadImage } from './helpers/s3ImageHelper';

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

    await assertItemExists(albumPath);
    await assertItemExists(getParentFromPath(albumPath));
    await assertItemExists(imagePath1);
    await assertItemExists(imagePath2);

    await assertImageExistsInOriginalsBucket(imagePath1);
    await assertImageExistsInOriginalsBucket(imagePath2);
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

test('Set Thumbnail on grandparent', async () => {
    const grandparentPath = getParentFromPath(albumPath);
    await expect(setAlbumThumbnail(grandparentPath, imagePath2)).resolves.not.toThrow();
    const album = await getAlbum(grandparentPath);
    expect(album?.thumbnail?.path).toBe(imagePath2);
});

test('Delete Image Should Unset Thumbnail', async () => {
    await expect(deleteImage(imagePath2)).resolves.not.toThrow();

    // Shouldn't be thumbnail of parent
    const album = await getAlbum(albumPath);
    expect(album?.thumbnail).toBeUndefined();

    // Shouldn't be thumbnail of grandparent
    const grandparentPath = getParentFromPath(albumPath);
    const grandparentAlbum = await getAlbum(grandparentPath);
    expect(grandparentAlbum?.thumbnail).toBeUndefined();
});
