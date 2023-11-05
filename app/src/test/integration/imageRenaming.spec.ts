import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { Album, AlbumResponse } from '../../lib/gallery/galleryTypes';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbumAndChildren';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { renameImage } from '../../lib/gallery/renameImage/renameImage';
import { getNameFromPath } from '../../lib/gallery_path_utils/getNameFromPath';
import { getParentFromPath } from '../../lib/gallery_path_utils/getParentFromPath';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';
import { cleanUpAlbum } from './helpers/albumHelpers';
import { originalImageExists, uploadImage } from './helpers/s3ImageHelper';

// I'm hoping these paths are unique to these tests,
// to help prevent polluting state between tests
const albumPath = '/1950/10-03/';
const imagePath1 = '/1950/10-03/image1.jpg';
const imagePath2 = '/1950/10-03/image2.jpg';
const renameImagePath1 = '/1950/10-03/image1_renamed.jpg';

beforeAll(async () => {
    await createAlbum(albumPath, false /* Don't error if album already exists */);
    await uploadImage('image.jpg', imagePath1);
    await uploadImage('image.jpg', imagePath2);
});

afterAll(async () => {
    await cleanUpAlbum(albumPath);
});

test('Validate test setup', async () => {
    // This test has to wait for the image processing lambda to trigger
    // TODO: I would love to implement push notifications so these tests become deterministic
    await new Promise((r) => setTimeout(r, 4000));

    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath1)).toBe(true);
    expect(isValidImagePath(imagePath1)).toBe(true);

    await expect(itemExists(albumPath)).resolves.toBe(true);
    await expect(itemExists(imagePath1)).resolves.toBe(true);
    await expect(itemExists(imagePath2)).resolves.toBe(true);

    await expect(originalImageExists(imagePath1)).resolves.toBe(true);
    await expect(originalImageExists(imagePath2)).resolves.toBe(true);
}, 10000 /* increase Jest's timeout */);

test('Cannot change extension', async () => {
    await expect(renameImage(imagePath1, 'invalidExtension.png')).rejects.toThrow(/extension/i);
});

test("Cannot rename an image that doesn't exist", async () => {
    await expect(renameImage('/1899/01-01/noSuchImage.jpg', 'new_name.jpg')).rejects.toThrow(/not found/i);
});

test('Cannot rename to same name as an existing image', async () => {
    const imageName2 = getNameFromPath(imagePath2);
    if (!imageName2) throw 'no image 2';
    await expect(renameImage(imagePath1, imageName2)).rejects.toThrow(/exists/i);
});

test('Do the rename', async () => {
    const image1NewName = getNameFromPath(renameImagePath1);
    if (!image1NewName) throw 'no image 1 new name';
    await renameImage(imagePath1, image1NewName);
});

test('GetAlbum() should reflect rename', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error('no album');
    if (!album?.children) throw new Error('no children');

    // Ensure album doesn't contain old image
    const oldImageName = getNameFromPath(imagePath1);
    if (!oldImageName) throw 'no old image name';
    if (findImage(album, oldImageName)) throw new Error(`Album still contains old image [${oldImageName}]`);

    // Ensure album contains new image
    const newImageName = getNameFromPath(renameImagePath1);
    if (!newImageName) throw 'no new image name';
    const renamedImage = findImage(album, newImageName);
    if (!renamedImage) throw new Error(`Album does not contain new image [${newImageName}]`);
    expect(renamedImage.itemName).toBe(newImageName);
    expect(renamedImage.parentPath).toBe(getParentFromPath(renameImagePath1));
});

test('Originals bucket should contain new image', async () => {
    await expect(originalImageExists(renameImagePath1)).resolves.toBe(true);
});

test('Originals bucket should not contain old image', async () => {
    await expect(originalImageExists(imagePath1)).resolves.toBe(false);
});

test.todo('Derived images bucket should no longer contain old image');
test.todo("Album's thumbnail should be the renamed image");
test.todo("Grandparent album's thumbnail should be the renamed image");
test.todo('GetLatestAlbum() has new image as its thumbnail');

function findImage(album: AlbumResponse, imageName: string): Album | undefined {
    return album?.children?.find((child) => child.itemName === imageName);
}
