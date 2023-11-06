import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { getAlbum } from '../../lib/gallery/getAlbum/getAlbum';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbumAndChildren';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { getParentAndNameFromPath } from '../../lib/gallery_path_utils/getParentAndNameFromPath';
import {
    assertDynamoDBItemDoesNotExist,
    assertDynamoDBItemExists,
    cleanUpAlbumAndParents,
} from './helpers/albumHelpers';

const albumPath = '/1700/04-26/'; // unique to this suite to prevent pollution
let title: string;
let description: string;

beforeAll(async () => {
    title = `Title [${Date.now}]`;
    description = `Description [${Date.now}]`;
    await assertDynamoDBItemDoesNotExist(albumPath);
    await createAlbum(albumPath);
    await assertDynamoDBItemExists(albumPath);
});

afterAll(async () => {
    await cleanUpAlbumAndParents(albumPath);
});

test('get empty album', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error(`No album`);
    if (album.children && album.children.length > 0) throw new Error(`Album has children, that's not expected`);
    const albumPathParts = getParentAndNameFromPath(albumPath);
    expect(album.album?.itemName).toBe(albumPathParts.name);
    expect(album.album?.parentPath).toBe(albumPathParts.parent);
    expect(album.album?.title).toBeUndefined();
    expect(album.album?.description).toBeUndefined();
    expect(album.album?.published).toBeUndefined();
    expect(album.album?.thumbnail?.path).toBeUndefined();
});

it('set title', async () => {
    await updateAlbum(albumPath, { title: title });
    const album = await getAlbum(albumPath);
    expect(album?.title).toBe(title);
    expect(album?.description).toBeUndefined();
    expect(album?.published).toBeUndefined();
});

it('set description', async () => {
    await updateAlbum(albumPath, { description: description });
    const album = await getAlbum(albumPath);
    expect(album?.title).toBe(title);
    expect(album?.description).toBe(description);
    expect(album?.published).toBeUndefined();
});

it('publish', async () => {
    await updateAlbum(albumPath, { published: true });
    const album = await getAlbum(albumPath);
    expect(album?.title).toBe(title);
    expect(album?.description).toBe(description);
    expect(album?.published).toBe(true);
});

it('unset title', async () => {
    await updateAlbum(albumPath, { title: '' });
    const album = await getAlbum(albumPath);
    expect(album?.title).toBe('');
    expect(album?.description).toBe(description);
    expect(album?.published).toBe(true);
});

it('unset description', async () => {
    await updateAlbum(albumPath, { description: '' });
    const album = await getAlbum(albumPath);
    expect(album?.title).toBe('');
    expect(album?.description).toBe('');
    expect(album?.published).toBe(true);
});

it('unpublish', async () => {
    await updateAlbum(albumPath, { published: false });
    const album = await getAlbum(albumPath);
    expect(album?.title).toBe('');
    expect(album?.description).toBe('');
    expect(album?.published).toBe(false);
});

it('set title & description & published', async () => {
    await updateAlbum(albumPath, { title: title, description: description, published: true });
    const album = await getAlbum(albumPath);
    expect(album?.title).toBe(title);
    expect(album?.description).toBe(description);
    expect(album?.published).toBe(true);
});

test("attempting to create an album that already exists doesn't blow attributes away", async () => {
    await expect(createAlbum(albumPath, false /* don't error if it exists */)).resolves.not.toThrow();

    const album = await getAlbum(albumPath);
    expect(album?.title).toBe(title);
    expect(album?.description).toBe(description);
    expect(album?.published).toBe(true);
});
