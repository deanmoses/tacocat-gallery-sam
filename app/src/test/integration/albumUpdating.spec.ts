import assert from 'node:assert/strict';
import { createAlbum, createAlbumNoThrow } from '../../lib/gallery/createAlbum/createAlbum';
import { Album, AlbumUpdateRequest } from '../../lib/gallery/galleryTypes';
import { getAlbum } from '../../lib/gallery/getAlbum/getAlbum';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { cleanUpYear, getAlbumOrFail } from './helpers/fixtures';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.albumUpdating;
const albumPath = `${yearPath}04-26/`;
const description = `Description [${Date.now()}]`;
const summary = `Summary [${Date.now()}]`;
let createdOn: string;

/** The album as it appears in its year's child listing */
async function albumInYearListing(includeUnpublished = false): Promise<Album> {
    const year = await getAlbumOrFail(yearPath, includeUnpublished);
    const album = year.children?.find((child) => child.itemName === '04-26');
    assert(album?.itemType === 'album', `Year [${yearPath}] does not list album [${albumPath}]`);
    return album;
}

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await createAlbum(yearPath);
    await createAlbum(albumPath);
});

afterAll(() => cleanUpYear(yearPath));

test('rejects an unknown attribute', async () => {
    await expect(updateAlbum(albumPath, { unknownAttr: '' } as AlbumUpdateRequest)).rejects.toThrow(/unknown/i);
});

describe('a freshly created album', () => {
    test('has no attributes set', async () => {
        const album = await getAlbumOrFail(albumPath, true);
        expect(album.children).toEqual([]);
        expect(album.description).toBeUndefined();
        expect(album.summary).toBeUndefined();
        expect(album.published).toBeUndefined();
        expect(album.thumbnail).toBeUndefined();
        assert(album.updatedOn, 'Album has no updatedOn');
        createdOn = album.updatedOn;
    });

    test('cannot be published while its year is unpublished', async () => {
        await expect(updateAlbum(albumPath, { published: true })).rejects.toThrow(/parent/i);
    });
});

describe('after publishing the year and then the album', () => {
    beforeAll(async () => {
        await updateAlbum(yearPath, { published: true });
        await updateAlbum(albumPath, { published: true });
    });

    test('the album is published', async () => {
        const album = await getAlbum(albumPath);
        expect(album?.published).toBe(true);
    });
});

describe('after setting the description and then the summary', () => {
    beforeAll(async () => {
        await updateAlbum(albumPath, { description });
        await updateAlbum(albumPath, { summary });
    });

    test('both are set and nothing else changed', async () => {
        const album = await getAlbum(albumPath);
        expect(album?.description).toBe(description);
        expect(album?.summary).toBe(summary);
        expect(album?.published).toBe(true);
        expect(album?.updatedOn).not.toBe(createdOn);
    });

    test('the year listing reflects them', async () => {
        const album = await albumInYearListing();
        expect(album.description).toBe(description);
        expect(album.summary).toBe(summary);
        expect(album.published).toBe(true);
    });
});

describe('after clearing the description and summary and unpublishing', () => {
    beforeAll(async () => {
        await updateAlbum(albumPath, { description: '' });
        await updateAlbum(albumPath, { summary: '' });
        await updateAlbum(albumPath, { published: false });
    });

    test('all three took effect', async () => {
        const album = await getAlbum(albumPath, true);
        expect(album?.description).toBe('');
        expect(album?.summary).toBe('');
        expect(album?.published).toBe(false);
    });

    test('the year listing reflects them', async () => {
        const album = await albumInYearListing(true);
        expect(album.description).toBe('');
        expect(album.summary).toBe('');
        expect(album.published).toBe(false);
    });
});

describe('after setting summary, description and published in one update', () => {
    beforeAll(() => updateAlbum(albumPath, { summary, description, published: true }));

    test('all three took effect', async () => {
        const album = await getAlbum(albumPath);
        expect(album?.summary).toBe(summary);
        expect(album?.description).toBe(description);
        expect(album?.published).toBe(true);
    });

    test('creating the album again without throwing leaves them alone', async () => {
        await expect(createAlbumNoThrow(albumPath)).resolves.toBe(false);
        const album = await getAlbum(albumPath);
        expect(album?.summary).toBe(summary);
        expect(album?.description).toBe(description);
        expect(album?.published).toBe(true);
    });
});
