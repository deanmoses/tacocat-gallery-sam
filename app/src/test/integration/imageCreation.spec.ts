import assert from 'node:assert/strict';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';
import { deleteMedia } from '../../lib/gallery/deleteMedia/deleteMedia';
import { getAlbum } from '../../lib/gallery/getAlbum/getAlbum';
import { search } from '../../lib/gallery/search/search';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { findMedia, findSubAlbum } from '../../lib/gallery_client/AlbumObject';
import { getNameFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { cleanUpYear, getAlbumOrFail, setUpAlbumWithImages } from './helpers/fixtures';
import { waitForRedisItem, waitForRedisItemGone } from './helpers/redis';
import { originalExists } from './helpers/s3';
import { TEST_YEARS } from './helpers/testYears';
import { waitFor } from './helpers/waitFor';

const yearPath = TEST_YEARS.imageCreation;
const albumPath = `${yearPath}09-02/`;
const imageName = 'image1.jpg';
const imagePath = albumPath + imageName;

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await setUpAlbumWithImages(albumPath, { [imageName]: 'images/image.jpg' });
});

afterAll(() => cleanUpYear(yearPath));

describe('after uploading an image into an album that did not exist', () => {
    test('the day and year albums were created', async () => {
        await expect(itemExists(albumPath)).resolves.toBe(true);
        await expect(itemExists(yearPath)).resolves.toBe(true);
    });

    test('the album lists the image with its embedded metadata', async () => {
        const image = findMedia(await getAlbumOrFail(albumPath), imageName);
        assert(image, `Album [${albumPath}] does not contain [${imageName}]`);
        expect(image.parentPath).toBe(albumPath);
        expect(image.versionId).toEqual(expect.any(String));
        expect(image.title).toBe('Image Title');
        expect(image.tags?.sort()).toEqual(['test1', 'test2', 'test3']);
    });

    test('the image became the album thumbnail', async () => {
        const album = findSubAlbum(await getAlbumOrFail(yearPath), getNameFromPath(albumPath));
        assert(album, `Year [${yearPath}] does not list [${albumPath}]`);
        expect(album.thumbnail?.path).toBe(imagePath);
        expect(album.thumbnail?.versionId).toBeDefined();
    });

    test('the image synced to Redis', () => waitForRedisItem(imagePath));

    test('a title search within the year finds the image', async () => {
        // Every suite uploads this fixture, so the year keeps the others out
        const year = getNameFromPath(yearPath);
        await waitFor(
            async () => {
                const results = await search({ terms: 'Image Title', oldestYear: year, newestYear: year });
                return results.items.some((item) => item.path === imagePath);
            },
            { description: `search to find [${imagePath}]` },
        );
    });

    test('the album cannot be deleted while it has children', async () => {
        await expect(deleteAlbum(albumPath)).rejects.toThrow(/child/i);
    });
});

describe('after deleting the image', () => {
    beforeAll(() => deleteMedia(imagePath));

    test('the album no longer lists it', async () => {
        const album = await getAlbumOrFail(albumPath);
        expect(findMedia(album, imageName)).toBeUndefined();
    });

    test('the album no longer has a thumbnail', async () => {
        const album = await getAlbum(albumPath);
        expect(album?.thumbnail).toBeUndefined();
    });

    test('the originals bucket no longer holds it', async () => {
        await expect(originalExists(imagePath)).resolves.toBe(false);
    });

    test('it is removed from Redis', () => waitForRedisItemGone(imagePath));
});
