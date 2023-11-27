import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { getLatestAlbum } from '../../lib/gallery/getLatestAlbum/getLatestAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { recutThumbnail } from '../../lib/gallery/recutThumbnail/recutThumbnail';
import { findImage } from '../../lib/gallery_client/AlbumObject';
import { getParentAndNameFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { assertDynamoDBItemDoesNotExist, cleanUpAlbum } from './helpers/albumHelpers';
import { getAlbumPathForToday, reallyGetNameFromPath } from './helpers/pathHelpers';
import { uploadImage } from './helpers/s3ImageHelper';

const imageName = 'image.jpg';
let albumPath: string;
let imagePath: string;
const cropInPct = { x: 0, y: 0, width: 100, height: 100 };
const cropInPx = { x: 0, y: 0, width: 220, height: 212 };

beforeAll(async () => {
    albumPath = getAlbumPathForToday(); // use current year so that getLatestAlbum will always return something
    imagePath = albumPath + imageName;
    await assertDynamoDBItemDoesNotExist(albumPath);
    await createAlbum(albumPath, { published: true });
});

afterAll(async () => {
    await cleanUpAlbum(albumPath);
});

test('Should get latest album', async () => {
    const album = await getLatestAlbum();
    if (!album) throw new Error(`No latest album`);
    const albumPathParts = getParentAndNameFromPath(albumPath);
    expect(album.itemName).toBe(albumPathParts.name);
    expect(album.parentPath).toBe(albumPathParts.parent);
    expect(album.path).toBe(albumPath);
    if (album.thumbnail?.path) throw new Error(`Was expecting album thumbnail to be undefined [${album.thumbnail}]`);
});

test('Upload image', async () => {
    await uploadImage('image.jpg', imagePath);
    // wait for the image processing lambda to trigger
    // TODO: I would love to implement push notifications so these tests become deterministic
    await new Promise((r) => setTimeout(r, 4000));
    await expect(itemExists(imagePath)).resolves.toBe(true);
}, 10000 /* increase Jest's timeout */);

test("Image should be latest album's thumb", async () => {
    const album = await getLatestAlbum();
    if (!album) throw new Error(`No latest album`);
    const albumPathParts = getParentAndNameFromPath(albumPath);
    expect(album.itemName).toBe(albumPathParts.name);
    expect(album.parentPath).toBe(albumPathParts.parent);
    expect(album.thumbnail?.path).toBe(imagePath);
});

test('Recut image thumb', async () => {
    await expect(recutThumbnail(imagePath, cropInPct)).resolves.not.toThrow();
});

test('Latest album honors recut thumb', async () => {
    const album = await getLatestAlbum();
    if (!album) throw new Error(`No latest album`);
    if (!album?.thumbnail) throw new Error('Expected latest album to have thumbnail');
    expect(album.thumbnail.path).toBe(imagePath);
    expect(album.thumbnail.crop).toEqual(cropInPx);
});

test.todo("Latest album's thumbnail entry should honor an image rename");

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
