/**
 * Uploading through a presigned URL, as the gallery app does: the URL the
 * library signs has to be one S3 accepts for a PUT and nothing else, and the
 * upload it admits has to reach the upload-processing Lambda like any other.
 */
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { generateUploadUrls } from '../../lib/gallery/generateUploadUrls/generateUploadUrls';
import { cleanUpYear, getMediaOrFail, waitForMediaItem } from './helpers/fixtures';
import { originalExists } from './helpers/s3';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.presignedUpload;
const albumPath = `${yearPath}03-14/`;
const imagePath = `${albumPath}image1.jpg`;
const otherImagePath = `${albumPath}image2.jpg`;
const fixture = path.resolve(__dirname, '..', 'data', 'images', 'image.jpg');
let uploadUrl: string;

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await createAlbum(yearPath);
    await createAlbum(albumPath);
    const urls = await generateUploadUrls(albumPath, [imagePath, otherImagePath]);
    assert(urls[imagePath], `No upload URL for [${imagePath}]`);
    uploadUrl = urls[imagePath];
});

afterAll(() => cleanUpYear(yearPath));

describe('the presigned URL', () => {
    it('is for the originals bucket key of the image', () => {
        const url = new URL(uploadUrl);

        expect(url.protocol).toBe('https:');
        expect(url.pathname).toBe(imagePath);
        expect(url.searchParams.get('X-Amz-Signature')).toStrictEqual(expect.any(String));
    });

    it('cannot be used to read', async () => {
        const response = await fetch(uploadUrl);

        expect(response.status).toBe(403);
    });

    it('cannot be used for another image', async () => {
        const response = await fetch(uploadUrl.replace('image1.jpg', 'image2.jpg'), {
            method: 'PUT',
            body: fs.readFileSync(fixture),
        });

        expect(response.status).toBe(403);
    });
});

describe('after uploading through the presigned URL', () => {
    let versionId: string | null;

    beforeAll(async () => {
        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'content-type': 'image/jpeg' },
            body: fs.readFileSync(fixture),
        });
        assert(response.ok, `Upload failed: ${response.status} ${await response.text()}`);
        versionId = response.headers.get('x-amz-version-id');
        await waitForMediaItem(imagePath);
    });

    it('the originals bucket holds the image', async () => {
        await expect(originalExists(imagePath)).resolves.toBe(true);
    });

    it('the upload-processing Lambda recorded that version of the image', async () => {
        const image = await getMediaOrFail(imagePath, true);

        expect(versionId).toStrictEqual(expect.any(String));
        expect(image.versionId).toBe(versionId);
        expect(image.title).toBe('Image Title');
    });

    it('the other image, never uploaded, is not in the album', async () => {
        await expect(originalExists(otherImagePath)).resolves.toBe(false);
    });
});
