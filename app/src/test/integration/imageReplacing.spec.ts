import assert from 'node:assert/strict';
import { cleanUpYear, getMediaOrFail, setUpAlbumWithImages, waitForMediaVersion } from './helpers/fixtures';
import { uploadMedia } from './helpers/s3';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.imageReplacing;
const albumPath = `${yearPath}07-12/`;
/** Uploaded with full metadata, then replaced by a version with different metadata */
const fullPath = `${albumPath}full.jpg`;
/** Uploaded with no metadata, then replaced by a version that has some */
const barePath = `${albumPath}bare.jpg`;
let fullVersion1: string | undefined;
let fullUpdatedOn1: string | undefined;
let bareVersion1: string | undefined;

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await setUpAlbumWithImages(albumPath, {
        'full.jpg': 'images/replaceImage/noreplace_metadata_v1.jpg',
        'bare.jpg': 'images/replaceImage/replace_metadata_v1.jpg',
    });
});

afterAll(() => cleanUpYear(yearPath));

describe('the first uploads', () => {
    it('the image with metadata has it', async () => {
        const image = await getMediaOrFail(fullPath);
        expect(image.title).toBe('Version 1');
        expect(image.description).toBe('Version one.');
        expect(image.tags?.sort()).toStrictEqual(['animal', 'boar', 'frog', 'v1']);
        assert(image.versionId, `[${fullPath}] has no versionId`);
        fullVersion1 = image.versionId;
        fullUpdatedOn1 = image.updatedOn;
    });

    it('the image without metadata has none', async () => {
        const image = await getMediaOrFail(barePath);
        expect(image.title).toBeUndefined();
        expect(image.description).toBeUndefined();
        expect(image.tags ?? []).toStrictEqual([]);
        assert(image.versionId, `[${barePath}] has no versionId`);
        bareVersion1 = image.versionId;
    });
});

describe('after uploading a second version of each', () => {
    beforeAll(async () => {
        const [fullVersion2, bareVersion2] = await Promise.all([
            uploadMedia('images/replaceImage/noreplace_metadata_v2.jpg', fullPath),
            uploadMedia('images/replaceImage/replace_metadata_v2.jpg', barePath),
        ]);
        await Promise.all([waitForMediaVersion(fullPath, fullVersion2), waitForMediaVersion(barePath, bareVersion2)]);
    });

    it('the image with metadata keeps its title and description and merges its tags', async () => {
        const image = await getMediaOrFail(fullPath);
        expect(image.title).toBe('Version 1');
        expect(image.description).toBe('Version one.');
        expect(image.tags?.sort()).toStrictEqual(['animal', 'boar', 'frog', 'v1', 'v2']);
        expect(image.versionId).not.toBe(fullVersion1);
        expect(image.updatedOn).not.toBe(fullUpdatedOn1);
    });

    it('the image without metadata takes the new metadata', async () => {
        const image = await getMediaOrFail(barePath);
        expect(image.title).toBe('Version 2');
        expect(image.description).toBe('Version two.');
        expect(image.tags?.sort()).toStrictEqual(['forest', 'v2']);
        expect(image.versionId).not.toBe(bareVersion1);
    });
});
