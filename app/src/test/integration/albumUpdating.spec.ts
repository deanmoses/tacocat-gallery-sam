import { createAlbum, createAlbumNoThrow } from '../../lib/gallery/createAlbum/createAlbum';
import { Album, AlbumUpdateRequest } from '../../lib/gallery/galleryTypes';
import { getAlbum } from '../../lib/gallery/getAlbum/getAlbum';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { getParentAndNameFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import {
    assertDynamoDBItemDoesNotExist,
    assertDynamoDBItemExists,
    cleanUpAlbumAndParents,
} from './helpers/albumHelpers';

const yearAlbumPath = '/1700/'; // unique to this suite to prevent pollution
const albumPath = `${yearAlbumPath}04-26/`;
let description: string;
let summary: string;
let album_updatedOn: string | undefined;

beforeAll(async () => {
    description = `Description [${Date.now}]`;
    summary = `Summary [${Date.now}]`;
    await Promise.all([
        await assertDynamoDBItemDoesNotExist(yearAlbumPath),
        await assertDynamoDBItemDoesNotExist(albumPath),
    ]);
    await Promise.all([await createAlbum(yearAlbumPath), await createAlbum(albumPath)]);
    await assertDynamoDBItemExists(albumPath);
});

afterAll(async () => {
    await cleanUpAlbumAndParents(albumPath);
});

test('fail on unknown attribute', async () => {
    await expect(updateAlbum(albumPath, { unknownAttr: '' } as AlbumUpdateRequest)).rejects.toThrow(/unknown/i);
});

test('get empty album', async () => {
    const album = await getAlbumAndChildren(albumPath, true /* include unpublished albums */);
    if (!album) throw new Error(`No album`);
    if (album.children && album.children.length > 0) throw new Error(`Album has children, that's not expected`);
    const albumPathParts = getParentAndNameFromPath(albumPath);
    expect(album?.itemName).toBe(albumPathParts.name);
    expect(album?.parentPath).toBe(albumPathParts.parent);
    expect(album?.description).toBeUndefined();
    expect(album?.published).toBeUndefined();
    expect(album?.thumbnail?.path).toBeUndefined();
    if (!album?.updatedOn) throw new Error(`Album has no updatedOn`);
    album_updatedOn = album.updatedOn;
});

test('fail to publish if parent is not published', async () => {
    await expect(updateAlbum(albumPath, { published: true } as AlbumUpdateRequest)).rejects.toThrow(/parent/i);
});

test('publish parent should succeeed', async () => {
    await expect(updateAlbum(yearAlbumPath, { published: true } as AlbumUpdateRequest)).resolves.not.toThrow();
});

test('publish suceeds after parent is published', async () => {
    await expect(updateAlbum(albumPath, { published: true } as AlbumUpdateRequest)).resolves.not.toThrow();
});

test('set description', async () => {
    await updateAlbum(albumPath, { description: description });
    const album = await getAlbum(albumPath);
    expect(album?.description).toBe(description);
    expect(album?.published).toBe(true);
    if (!album?.updatedOn) throw new Error(`Album has no updatedOn`);
    expect(album.updatedOn).not.toBe(album_updatedOn);
});

test('set summary', async () => {
    await updateAlbum(albumPath, { summary: summary });
    const album = await getAlbum(albumPath);
    expect(album?.summary).toBe(summary);
});

test('publish', async () => {
    await updateAlbum(albumPath, { published: true });
    const album = await getAlbum(albumPath);
    expect(album?.description).toBe(description);
    expect(album?.published).toBe(true);
});

test('getChildren should reflect changes', async () => {
    const yearAlbum = await getAlbumAndChildren(yearAlbumPath);
    if (!yearAlbum) throw new Error(`No year album [${yearAlbumPath}]`);
    const album = yearAlbum?.children?.[0] as Album;
    if (!album) throw new Error(`Year album [${yearAlbumPath}] did not have any children`);
    expect(album?.description).toBe(description);
    expect(album?.published).toBe(true);
});

test('unset description', async () => {
    await updateAlbum(albumPath, { description: '' });
    const album = await getAlbum(albumPath);
    expect(album?.description).toBe('');
    expect(album?.published).toBe(true);
});

test('unset summary', async () => {
    await updateAlbum(albumPath, { summary: '' });
    const album = await getAlbum(albumPath);
    expect(album?.summary).toBe('');
});

test('unpublish', async () => {
    await updateAlbum(albumPath, { published: false });
    const album = await getAlbum(albumPath, true /* include unpublished albums */);
    expect(album?.description).toBe('');
    expect(album?.published).toBe(false);
    expect(album?.summary).toBe('');
});

test('getChildren should reflect the unsettings', async () => {
    const yearAlbum = await getAlbumAndChildren(yearAlbumPath, true /* include unpublished albums */);
    if (!yearAlbum) throw new Error(`No year album [${yearAlbumPath}]`);
    const album = yearAlbum?.children?.[0] as Album;
    if (!album) throw new Error(`Year album [${yearAlbumPath}] did not have any children`);
    expect(album?.summary).toBe('');
    expect(album?.description).toBe('');
    expect(album?.published).toBe(false);
});

test('set summary & description & published', async () => {
    await updateAlbum(albumPath, { summary: summary, description: description, published: true });
    const album = await getAlbum(albumPath);
    expect(album?.summary).toBe(summary);
    expect(album?.description).toBe(description);
    expect(album?.published).toBe(true);
});

test("attempting to create an album that already exists doesn't blow attributes away", async () => {
    await expect(createAlbumNoThrow(albumPath)).resolves.not.toThrow();

    const album = await getAlbum(albumPath);
    expect(album?.summary).toBe(summary);
    expect(album?.description).toBe(description);
    expect(album?.published).toBe(true);
});
