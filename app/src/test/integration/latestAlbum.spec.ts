import assert from 'node:assert/strict';
import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteMedia } from '../../lib/gallery/deleteMedia/deleteMedia';
import type { AlbumThumbnail } from '../../lib/gallery/galleryTypes';
import { getLatestAlbum } from '../../lib/gallery/getLatestAlbum/getLatestAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { recutThumbnail } from '../../lib/gallery/recutThumbnail/recutThumbnail';
import { renameMedia } from '../../lib/gallery/renameMedia/renameMedia';
import { findMedia } from '../../lib/gallery_client/AlbumObject';
import { cleanUpAlbum, getAlbumOrFail, waitForMediaItem } from './helpers/fixtures';
import { uploadMedia } from './helpers/s3';

// The latest album is looked up within the current year, so this suite works
// in today's album rather than in a test year of its own
const albumPath = albumPathForToday();
const imagePath = `${albumPath}image.jpg`;
const renamedImagePath = `${albumPath}renamed.jpg`;
const cropInPct = { x: 0, y: 0, width: 100, height: 100 };
const cropInPx = { x: 0, y: 0, width: 220, height: 212 };

function albumPathForToday(): string {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    return `/${now.getUTCFullYear()}/${month}-${day}/`;
}

async function latestAlbum(): Promise<AlbumThumbnail> {
    const album = await getLatestAlbum();
    assert(album, 'No latest album');
    return album;
}

beforeAll(async () => {
    await cleanUpAlbum(albumPath);
    await createAlbum(albumPath, { published: true });
});

afterAll(() => cleanUpAlbum(albumPath));

describe("with an empty album for today's date", () => {
    it('is the latest album and has no thumbnail', async () => {
        const album = await latestAlbum();

        expect(album.path).toBe(albumPath);
        expect(album.thumbnail).toBeUndefined();
    });
});

describe('after uploading an image', () => {
    beforeAll(async () => {
        await uploadMedia('images/image.jpg', imagePath);
        await waitForMediaItem(imagePath);
    });

    it('exists', async () => {
        await expect(itemExists(imagePath)).resolves.toBe(true);
    });

    it("is the latest album's thumbnail, with a version", async () => {
        const album = await latestAlbum();

        expect(album.path).toBe(albumPath);
        expect(album.thumbnail?.path).toBe(imagePath);
        expect(album.thumbnail?.versionId).toBeDefined();
    });
});

describe('after recutting the thumbnail', () => {
    beforeAll(() => recutThumbnail(imagePath, cropInPct));

    it('the latest album shows the crop', async () => {
        const album = await latestAlbum();

        expect(album.thumbnail?.path).toBe(imagePath);
        expect(album.thumbnail?.crop).toStrictEqual(cropInPx);
    });
});

describe('after renaming the image', () => {
    beforeAll(() => renameMedia(imagePath, 'renamed.jpg'));

    it('the latest album thumbnail follows the rename', async () => {
        const album = await latestAlbum();

        expect(album.thumbnail?.path).toBe(renamedImagePath);
        expect(album.thumbnail?.versionId).toBeDefined();
    });
});

describe('after deleting the image', () => {
    beforeAll(() => deleteMedia(renamedImagePath));

    it('the album no longer lists it', async () => {
        const album = await getAlbumOrFail(albumPath);

        expect(findMedia(album, 'renamed.jpg')).toBeUndefined();
    });

    it('the latest album no longer has a thumbnail', async () => {
        const album = await latestAlbum();

        expect(album.thumbnail).toBeUndefined();
    });
});
