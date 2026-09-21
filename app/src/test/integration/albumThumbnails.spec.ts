import assert from 'node:assert/strict';
import { deleteMedia } from '../../lib/gallery/deleteMedia/deleteMedia';
import { AlbumThumbnailEntry } from '../../lib/gallery/galleryTypes';
import { getAlbum } from '../../lib/gallery/getAlbum/getAlbum';
import { recutThumbnail } from '../../lib/gallery/recutThumbnail/recutThumbnail';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { findSubAlbum } from '../../lib/gallery_client/AlbumObject';
import { getNameFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { cleanUpYear, getAlbumOrFail, setUpAlbumWithImages } from './helpers/fixtures';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.albumThumbnails;
const albumPath = `${yearPath}10-04/`;
const imagePath = `${albumPath}image2.jpg`;
const cropInPct = { x: 0, y: 0, width: 100, height: 100 };
const cropInPx = { x: 0, y: 0, width: 220, height: 212 };

/** The thumbnail of the named child album as its parent's listing shows it */
async function thumbnailInListing(parentPath: string, childAlbumPath: string): Promise<AlbumThumbnailEntry> {
    const parent = await getAlbumOrFail(parentPath);
    const child = findSubAlbum(parent, getNameFromPath(childAlbumPath));
    assert(child, `Album [${parentPath}] does not list [${childAlbumPath}]`);
    assert(child.thumbnail, `Album [${childAlbumPath}] has no thumbnail in the listing of [${parentPath}]`);
    return child.thumbnail;
}

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await setUpAlbumWithImages(albumPath, { 'image1.jpg': 'images/image.jpg', 'image2.jpg': 'images/image.jpg' });
});

afterAll(() => cleanUpYear(yearPath));

test('rejects an image that does not exist', async () => {
    await expect(setAlbumThumbnail(albumPath, '/1949/10-04/no_such_image.jpg')).rejects.toThrow(/found/i);
});

describe('after setting the day album thumbnail', () => {
    beforeAll(() => setAlbumThumbnail(albumPath, imagePath));

    test('the year listing shows it on the day album, with a version and no crop', async () => {
        const thumbnail = await thumbnailInListing(yearPath, albumPath);
        expect(thumbnail.path).toBe(imagePath);
        expect(thumbnail.versionId).toEqual(expect.any(String));
        expect(thumbnail.crop).toBeUndefined();
    });
});

describe('after setting the year album thumbnail', () => {
    beforeAll(() => setAlbumThumbnail(yearPath, imagePath));

    test('the year album has it', async () => {
        const year = await getAlbum(yearPath);
        expect(year?.thumbnail?.path).toBe(imagePath);
        expect(year?.thumbnail?.crop).toBeUndefined();
    });

    test('the root listing shows it on the year', async () => {
        const thumbnail = await thumbnailInListing('/', yearPath);
        expect(thumbnail.path).toBe(imagePath);
        expect(thumbnail.crop).toBeUndefined();
    });
});

describe('after recutting the thumbnail', () => {
    beforeAll(() => recutThumbnail(imagePath, cropInPct));

    test('the year listing shows the crop on the day album', async () => {
        const thumbnail = await thumbnailInListing(yearPath, albumPath);
        expect(thumbnail.path).toBe(imagePath);
        expect(thumbnail.crop).toEqual(cropInPx);
    });

    test('the root listing shows the crop on the year', async () => {
        const thumbnail = await thumbnailInListing('/', yearPath);
        expect(thumbnail.path).toBe(imagePath);
        expect(thumbnail.crop).toEqual(cropInPx);
    });

    // Known gap: a recut is stored on the image, and only child listings look it up.
    // Reading the album itself returns the thumbnail entry as it was when it was set.
    // This flips to a failure when the gap is closed, which is the cue to drop `.failing`.
    test.failing('the year album read directly shows the crop', async () => {
        const year = await getAlbum(yearPath);
        expect(year?.thumbnail?.crop).toEqual(cropInPx);
    });
});

describe('after deleting the image', () => {
    beforeAll(() => deleteMedia(imagePath));

    test('the day and year albums no longer have a thumbnail', async () => {
        const [album, year] = await Promise.all([getAlbum(albumPath), getAlbum(yearPath)]);
        expect(album?.thumbnail).toBeUndefined();
        expect(year?.thumbnail).toBeUndefined();
    });
});
