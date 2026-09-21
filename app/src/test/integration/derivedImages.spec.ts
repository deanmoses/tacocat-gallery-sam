/**
 * Derived (resized) images requested through the image CDN: the CloudFront
 * Function that validates and rewrites the URL, the Lambda that renders the
 * image, and the derived bucket it writes to.
 */
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { deleteMedia } from '../../lib/gallery/deleteMedia/deleteMedia';
import { getGalleryAppDomain } from '../../lib/lambda_utils/Env';
import { cleanUpYear, setUpAlbumWithImages } from './helpers/fixtures';
import { derivedExists, downloadDerived } from './helpers/s3';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.derivedImages;
const albumPath = `${yearPath}02-18/`;
const imagePath = `${albumPath}image1.jpg`;
/** Smaller than the fixture in both dimensions, so the Lambda has to resize rather than pass it through */
const size = { width: 45, height: 45 };
const sizeSegment = `${size.width}x${size.height}`;
const cdn = `https://img.${getGalleryAppDomain()}`;
let versionId: string;
/** Where the CDN's Lambda writes the derived image in the derived bucket */
let derivedPath: string;

function fetchDerived(query: string): Promise<Response> {
    return fetch(`${cdn}/i${imagePath}${query}`, { cache: 'no-store' });
}

/**
 * The reason from an error response. Read from the body, never from
 * response.statusText: that is the HTTP/1.1 reason phrase, which HTTP/2 and
 * HTTP/3 dropped, and this distribution serves both.
 */
async function errorMessageOf(response: Response): Promise<string | undefined> {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage;
}

async function dimensionsOf(image: Buffer): Promise<{ format?: string; width?: number; height?: number }> {
    const { format, width, height } = await sharp(image).metadata();
    return { format, width, height };
}

beforeAll(async () => {
    await cleanUpYear(yearPath);
    const versionIds = await setUpAlbumWithImages(albumPath, { 'image1.jpg': 'images/image.jpg' });
    versionId = versionIds[imagePath];
    derivedPath = `${imagePath}/${versionId}/${sizeSegment}`;
});

afterAll(() => cleanUpYear(yearPath));

describe('a malformed request', () => {
    it('with neither version nor size is rejected at the edge', async () => {
        const response = await fetchDerived('');

        expect(response.status).toBe(400);
    });

    it('without a version is rejected at the edge', async () => {
        const response = await fetchDerived(`?size=${sizeSegment}`);

        expect(response.status).toBe(400);
        await expect(errorMessageOf(response)).resolves.toMatch(/version/i);
    });

    it('without a size is rejected at the edge', async () => {
        const response = await fetchDerived(`?version=${versionId}`);

        expect(response.status).toBe(400);
        await expect(errorMessageOf(response)).resolves.toMatch(/size/i);
    });
});

describe('after requesting a derived image', () => {
    let response: Response;
    let served: Buffer;

    beforeAll(async () => {
        response = await fetchDerived(`?version=${versionId}&size=${sizeSegment}`);
        // Read the body before asserting: a template literal evaluates whether or not the assertion fails
        served = Buffer.from(await response.arrayBuffer());
        assert(response.status === 200, `Derived image request failed: ${response.status} ${served.toString()}`);
    });

    it('the response is a JPEG', () => {
        expect(response.headers.get('content-type')).toBe('image/jpeg');
    });

    it('the response decodes to the requested size', async () => {
        await expect(dimensionsOf(served)).resolves.toStrictEqual({ format: 'jpeg', ...size });
    });

    it('the derived bucket holds the same bytes', async () => {
        await expect(derivedExists(derivedPath)).resolves.toBe(true);
        await expect(downloadDerived(derivedPath)).resolves.toStrictEqual(served);
    });
});

describe('after deleting the image', () => {
    beforeAll(() => deleteMedia(imagePath));

    it('the derived bucket no longer holds the derived image', async () => {
        await expect(derivedExists(derivedPath)).resolves.toBe(false);
    });
});
