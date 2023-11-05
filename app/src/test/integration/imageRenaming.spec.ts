import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbumAndChildren';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { renameImage } from '../../lib/gallery/renameImage/renameImage';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { findImage } from '../../lib/gallery_client/AlbumObject';
import { getNameFromPath } from '../../lib/gallery_path_utils/getNameFromPath';
import { getParentFromPath } from '../../lib/gallery_path_utils/getParentFromPath';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';
import { cleanUpAlbum } from './helpers/albumHelpers';
import { imageExistsInOriginalsBucket, uploadImage } from './helpers/s3ImageHelper';

const albumPath = '/1950/10-03/'; // unique to this suite to prevent pollution
const imagePath1 = `${albumPath}image1.jpg`;
const imagePath2 = `${albumPath}image2.jpg`;
const renameImagePath1 = `${albumPath}image1_renamed.jpg`;

beforeAll(async () => {
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath1)).toBe(true);
    expect(isValidImagePath(imagePath2)).toBe(true);

    if (await itemExists(albumPath)) throw new Error(`Album [${albumPath}] cannot exist at start of suite`);
    await createAlbum(albumPath, false);
    await uploadImage('image.jpg', imagePath1);
    await uploadImage('image.jpg', imagePath2);
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered

    await expect(itemExists(albumPath)).resolves.toBe(true);
    await expect(itemExists(imagePath1)).resolves.toBe(true);
    await expect(itemExists(imagePath2)).resolves.toBe(true);

    await expect(imageExistsInOriginalsBucket(imagePath1)).resolves.toBe(true);
    await expect(imageExistsInOriginalsBucket(imagePath2)).resolves.toBe(true);

    await setAlbumThumbnail(
        albumPath,
        imagePath1,
        false /* Since the first uploaded image may have set this, don't error */,
    );
}, 10000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbum(albumPath);
});

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

    // Ensure album's thumbnail entry reflects rename
    console.log(`Album thumbnail path: `, album.album?.thumbnail?.path);
    expect(album.album?.thumbnail?.path).toBe(renameImagePath1);
});

test('Originals bucket should contain new image', async () => {
    await expect(imageExistsInOriginalsBucket(renameImagePath1)).resolves.toBe(true);
});

test('Originals bucket should not contain old image', async () => {
    await expect(imageExistsInOriginalsBucket(imagePath1)).resolves.toBe(false);
});

test.todo('Derived images bucket should no longer contain old image');
test.todo("Grandparent album's thumbnail entry should reflect the image rename");
test.todo("Latest album's thumbnail entry should reflect the image rename");
