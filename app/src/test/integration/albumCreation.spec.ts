import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { getParentAndNameFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { assertDynamoDBItemDoesNotExist } from './helpers/albumHelpers';

const albumPath = '/1701/08-13/'; // unique to this suite to prevent pollution
const albumPath2 = '/1701/08-14/';

beforeAll(async () => {
    await assertDynamoDBItemDoesNotExist(albumPath);
    await assertDynamoDBItemDoesNotExist(albumPath2);
});

afterAll(async () => {
    await deleteAlbum(albumPath);
    await deleteAlbum(albumPath2);
});

it('should fail on invalid album path', async () => {
    await expect(createAlbum('/2001/0101/')).rejects.toThrow(/invalid.*path/i);
});

test('album creation should succeed', async () => {
    await createAlbum(albumPath);
    await expect(itemExists(albumPath)).resolves.toBe(true);
});

test('getAlbum retrieves newly created album', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error(`No album`);
    if (album.children && album.children.length > 0) throw new Error(`Album has children, that's not expected`);
    const albumPathParts = getParentAndNameFromPath(albumPath);
    expect(album?.itemName).toBe(albumPathParts.name);
    expect(album?.parentPath).toBe(albumPathParts.parent);
    expect(album?.path).toBe(albumPath);
    expect(album?.description).toBeUndefined();
    expect(album?.published).toBeUndefined();
    expect(album?.thumbnail?.path).toBeUndefined();
});

it('should fail to create if album already exists', async () => {
    await expect(createAlbum(albumPath)).rejects.toThrow(/exists/i);
});

it('should fail on unknown attribute', async () => {
    await expect(createAlbum(albumPath, { unknownAttr: '' })).rejects.toThrow(/unknown/i);
});

test('deleteAlbum() succeeds on empty album', async () => {
    await expect(deleteAlbum(albumPath)).resolves.not.toThrow();
});

it('create with attributes', async () => {
    await createAlbum(albumPath2, {
        title: 'Title 1',
        description: 'Description 1',
        summary: 'Summary 1',
        published: true,
    });
    await expect(itemExists(albumPath2)).resolves.toBe(true);
});

test('getAlbum retrieves updated album', async () => {
    const album = await getAlbumAndChildren(albumPath2);
    if (!album) throw new Error(`No album`);
    if (album.children && album.children.length > 0) throw new Error(`Album has children, that's not expected`);
    const albumPathParts = getParentAndNameFromPath(albumPath2);
    expect(album?.itemName).toBe(albumPathParts.name);
    expect(album?.parentPath).toBe(albumPathParts.parent);
    expect(album?.path).toBe(albumPath2);
    expect(album?.description).toBe('Description 1');
    expect(album?.summary).toBe('Summary 1');
    expect(album?.published).toBe(true);
    expect(album?.thumbnail?.path).toBeUndefined();
});
