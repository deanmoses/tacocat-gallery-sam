import { createAlbumNoThrow } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { getLatestAlbum } from '../../lib/gallery/getLatestAlbum/getLatestAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { findImage } from '../../lib/gallery_client/AlbumObject';
import { getParentAndNameFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { assertDynamoDBItemDoesNotExist, cleanUpAlbum } from './helpers/albumHelpers';
import { getAlbumPathForToday, reallyGetNameFromPath } from './helpers/pathHelpers';
import { uploadImage } from './helpers/s3ImageHelper';

const imageName = 'image.jpg';
let albumPath: string;
let imagePath: string;

beforeAll(async () => {
    albumPath = getAlbumPathForToday(); // use current year so that getLatestAlbum will always return something
    imagePath = albumPath + imageName;
    await assertDynamoDBItemDoesNotExist(albumPath);
    await createAlbumNoThrow(albumPath);
});

afterAll(async () => {
    await cleanUpAlbum(albumPath);
});

test('Latest album should have no thumbnail', async () => {
    const album = (await getLatestAlbum())?.album;
    if (!album) throw new Error(`No latest album`);
    const albumPathParts = getParentAndNameFromPath(albumPath);
    expect(album.itemName).toBe(albumPathParts.name);
    expect(album.parentPath).toBe(albumPathParts.parent);
    expect(album.thumbnail?.path).toBeUndefined();
});

test('Upload image', async () => {
    await uploadImage('image.jpg', imagePath);

    // wait for the image processing lambda to trigger
    // TODO: I would love to implement push notifications so these tests become deterministic
    await new Promise((r) => setTimeout(r, 4000));
    await expect(itemExists(imagePath)).resolves.toBe(true);
}, 10000 /* increase Jest's timeout */);

test("Image should have been set to latest album's thumb", async () => {
    const album = (await getLatestAlbum())?.album;
    if (!album) throw new Error(`No latest album`);
    const albumPathParts = getParentAndNameFromPath(albumPath);
    expect(album?.itemName).toBe(albumPathParts.name);
    expect(album?.parentPath).toBe(albumPathParts.parent);
    expect(album.thumbnail?.path).toBe(imagePath);
});

test('Delete image', async () => {
    await expect(deleteImage(imagePath)).resolves.not.toThrow();
});

test('Latest album should no longer have a thumbnail', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw 'no album';
    const imageName = reallyGetNameFromPath(imagePath);
    const image = findImage(album, imagePath);
    if (!!image) throw new Error(`Image [${imageName}] should not exist in album [${albumPath}]`);
});

test.todo("Latest album's thumbnail entry should honor an image rename");
