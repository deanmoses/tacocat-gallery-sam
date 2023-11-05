import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbumAndChildren';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { getParentAndNameFromPath } from '../../lib/gallery_path_utils/getParentAndNameFromPath';

// I'm picking an album at random here, in the hope that it doesn't exist.
// Because this test is about creating and deleting an album without images.
const albumPath = '/1962/08-13/';

it('fails on invalid album path', async () => {
    await expect(createAlbum('/2001/0101/')).rejects.toThrow(/invalid.*path/i);
});

it('suceeds', async () => {
    if (await itemExists(albumPath)) throw Error(`Album [${albumPath}] already exists, can't do test`);
    await expect(createAlbum(albumPath)).resolves.not.toThrow();
    await expect(itemExists(albumPath)).resolves.toBe(true);
});

it('fails if album already exists', async () => {
    await expect(createAlbum(albumPath)).rejects.toThrow(/exists/);
});

test('doesnt throw if album already exists', async () => {
    await expect(createAlbum(albumPath, false /* don't error if it exists */)).resolves.not.toThrow();
});

test('getAlbum()', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error(`No album`);
    if (album.children && album.children.length > 0) throw new Error(`Album has children, that's not expected`);
    const albumPathParts = getParentAndNameFromPath(albumPath);
    expect(album.album?.itemName).toBe(albumPathParts.name);
    expect(album.album?.parentPath).toBe(albumPathParts.parent);
});

test.todo('getAlbum() has no thumb');

test('deleteAlbum() succeeds on empty album', async () => {
    await expect(deleteAlbum(albumPath)).resolves.not.toThrow();
});
