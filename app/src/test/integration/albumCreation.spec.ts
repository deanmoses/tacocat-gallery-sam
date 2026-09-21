import assert from 'node:assert/strict';
import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { getParentAndNameFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { cleanUpYear, getAlbumOrFail } from './helpers/fixtures';
import { waitForRedisItem, waitForRedisItemGone } from './helpers/redis';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.albumCreation;
const albumPath = `${yearPath}08-13/`;
const albumWithAttributesPath = `${yearPath}08-14/`;

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await createAlbum(yearPath, { published: true });
});

afterAll(() => cleanUpYear(yearPath));

test('rejects an invalid album path', async () => {
    await expect(createAlbum('/2001/0101/')).rejects.toThrow(/invalid.*path/i);
});

test('rejects an unknown attribute', async () => {
    await expect(createAlbum(`${yearPath}08-15/`, { unknownAttr: '' })).rejects.toThrow(/unknown/i);
});

describe('a new album', () => {
    beforeAll(() => createAlbum(albumPath));

    it('exists', async () => {
        await expect(itemExists(albumPath)).resolves.toBe(true);
    });

    it('is hidden from readers of published albums', async () => {
        await expect(getAlbumAndChildren(albumPath)).resolves.toBeUndefined();
    });

    it('is empty and unpublished when read with unpublished albums included', async () => {
        const album = await getAlbumOrFail(albumPath, true);
        const { parent, name } = getParentAndNameFromPath(albumPath);
        expect(album.children).toEqual([]);
        expect(album.itemName).toBe(name);
        expect(album.parentPath).toBe(parent);
        expect(album.path).toBe(albumPath);
        expect(album.description).toBeUndefined();
        expect(album.published).toBeUndefined();
        expect(album.thumbnail).toBeUndefined();
    });

    it('cannot be created again', async () => {
        await expect(createAlbum(albumPath)).rejects.toThrow(/exists/i);
    });

    it('syncs to Redis', () => waitForRedisItem(albumPath));
});

describe('after publishing the album', () => {
    beforeAll(() => updateAlbum(albumPath, { published: true }));

    it('is visible to readers of published albums', async () => {
        const album = await getAlbumOrFail(albumPath);
        expect(album.path).toBe(albumPath);
        expect(album.published).toBe(true);
        expect(album.children).toEqual([]);
    });
});

describe('after deleting the album', () => {
    beforeAll(() => deleteAlbum(albumPath));

    it('is gone', async () => {
        await expect(itemExists(albumPath)).resolves.toBe(false);
    });

    it('is removed from Redis', () => waitForRedisItemGone(albumPath));
});

describe('an album created with attributes', () => {
    beforeAll(() =>
        createAlbum(albumWithAttributesPath, { description: 'Description 1', summary: 'Summary 1', published: true }),
    );

    it('has them', async () => {
        const album = await getAlbumOrFail(albumWithAttributesPath);
        assert(album.children);
        expect(album.children).toHaveLength(0);
        expect(album.path).toBe(albumWithAttributesPath);
        expect(album.description).toBe('Description 1');
        expect(album.summary).toBe('Summary 1');
        expect(album.published).toBe(true);
        expect(album.thumbnail).toBeUndefined();
    });
});
