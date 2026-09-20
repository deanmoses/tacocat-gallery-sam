import assert from 'node:assert/strict';
import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { getAlbum, getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { renameAlbum } from '../../lib/gallery/renameAlbum/renameAlbum';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { findMedia } from '../../lib/gallery_client/AlbumObject';
import { cleanUpYear, getAlbumOrFail, getMediaOrFail, setUpAlbumWithImages } from './helpers/fixtures';
import { originalExists } from './helpers/s3';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.albumRenaming;
const oldAlbumName = '01-17';
const newAlbumName = '01-18';
const otherAlbumName = '01-19';
const oldAlbumPath = `${yearPath}${oldAlbumName}/`;
const newAlbumPath = `${yearPath}${newAlbumName}/`;
const otherAlbumPath = `${yearPath}${otherAlbumName}/`;
const imageName = 'image1.jpg';
const oldImagePath = oldAlbumPath + imageName;
const newImagePath = newAlbumPath + imageName;
let oldImageVersionId: string | undefined;

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await setUpAlbumWithImages(
        oldAlbumPath,
        { [imageName]: 'images/image.jpg', 'image2.jpg': 'images/image.jpg', 'image3.jpg': 'images/image.jpg' },
        { publish: false },
    );
    await Promise.all([
        createAlbum(otherAlbumPath),
        setAlbumThumbnail(oldAlbumPath, oldImagePath),
        setAlbumThumbnail(yearPath, oldImagePath),
    ]);
    oldImageVersionId = (await getMediaOrFail(oldImagePath, true)).versionId;
    assert(oldImageVersionId, `Image [${oldImagePath}] has no versionId`);
});

afterAll(() => cleanUpYear(yearPath));

describe('before renaming', () => {
    test('renaming to the same name rejects', async () => {
        await expect(renameAlbum(oldAlbumPath, oldAlbumName)).rejects.toThrow(/same/i);
    });

    test('renaming to the name of an existing album rejects', async () => {
        await expect(renameAlbum(oldAlbumPath, otherAlbumName)).rejects.toThrow(/exists/i);
    });
});

describe('after renaming the album', () => {
    beforeAll(() => renameAlbum(oldAlbumPath, newAlbumName));

    test('the originals bucket holds the image under the new path only', async () => {
        await expect(originalExists(oldImagePath)).resolves.toBe(false);
        await expect(originalExists(newImagePath)).resolves.toBe(true);
    });

    test('the old album is gone', async () => {
        await expect(getAlbumAndChildren(oldAlbumPath, true)).resolves.toBeUndefined();
    });

    test('the new album holds all the images, the renamed one under a new version', async () => {
        const album = await getAlbumOrFail(newAlbumPath, true);
        expect(album.children).toHaveLength(3);
        const image = findMedia(album, imageName);
        assert(image, `Album [${newAlbumPath}] does not contain [${imageName}]`);
        expect(image.parentPath).toBe(newAlbumPath);
        expect(image.versionId).toBeDefined();
        expect(image.versionId).not.toBe(oldImageVersionId);
    });

    test('the new album thumbnail points at the new image path', async () => {
        const album = await getAlbum(newAlbumPath, true);
        expect(album?.thumbnail?.path).toBe(newImagePath);
    });

    test('the year album thumbnail points at the new image path', async () => {
        const year = await getAlbum(yearPath, true);
        expect(year?.thumbnail?.path).toBe(newImagePath);
    });
});
