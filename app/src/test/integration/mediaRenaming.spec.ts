import assert from 'node:assert/strict';
import { getAlbum } from '../../lib/gallery/getAlbum/getAlbum';
import { renameMedia } from '../../lib/gallery/renameMedia/renameMedia';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { findMedia } from '../../lib/gallery_client/AlbumObject';
import { cleanUpYear, getAlbumOrFail, getMediaOrFail, setUpAlbumWithImages } from './helpers/fixtures';
import { originalExists } from './helpers/s3';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.mediaRenaming;
const albumPath = `${yearPath}10-03/`;
const oldName = 'image1.jpg';
const newName = 'image1_renamed.jpg';
const otherName = 'image2.jpg';
const oldPath = albumPath + oldName;
const newPath = albumPath + newName;
let oldVersionId: string | undefined;

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await setUpAlbumWithImages(
        albumPath,
        { [oldName]: 'images/image.jpg', [otherName]: 'images/image.jpg' },
        { publish: false },
    );
    await Promise.all([setAlbumThumbnail(albumPath, oldPath), setAlbumThumbnail(yearPath, oldPath)]);
    oldVersionId = (await getMediaOrFail(oldPath, true)).versionId;
    assert(oldVersionId, `Image [${oldPath}] has no versionId`);
});

afterAll(() => cleanUpYear(yearPath));

describe('before renaming', () => {
    test('changing the extension rejects', async () => {
        await expect(renameMedia(oldPath, 'invalidExtension.png')).rejects.toThrow(/extension/i);
    });

    test('renaming an image that does not exist rejects', async () => {
        await expect(renameMedia('/1899/01-01/noSuchImage.jpg', 'new_name.jpg')).rejects.toThrow(/not found/i);
    });

    test('renaming to the name of an existing image rejects', async () => {
        await expect(renameMedia(oldPath, otherName)).rejects.toThrow(/exists/i);
    });
});

describe('after renaming the image', () => {
    beforeAll(() => renameMedia(oldPath, newName));

    test('the album lists it under the new name with a new version, and not the old name', async () => {
        const album = await getAlbumOrFail(albumPath, true);
        expect(findMedia(album, oldName)).toBeUndefined();
        const image = findMedia(album, newName);
        assert(image, `Album [${albumPath}] does not contain [${newName}]`);
        expect(image.parentPath).toBe(albumPath);
        expect(image.versionId).toEqual(expect.any(String));
        expect(image.versionId).not.toBe(oldVersionId);
    });

    test('the album and year thumbnails point at the new path', async () => {
        const [album, year] = await Promise.all([getAlbum(albumPath, true), getAlbum(yearPath, true)]);
        expect(album?.thumbnail?.path).toBe(newPath);
        expect(year?.thumbnail?.path).toBe(newPath);
    });

    test('the originals bucket holds it under the new path only', async () => {
        await expect(originalExists(newPath)).resolves.toBe(true);
        await expect(originalExists(oldPath)).resolves.toBe(false);
    });
});
