/**
 * The image CDN's crawler opt-out and security headers and its robots.txt.
 * See template.yaml's response headers policies.
 */
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { cleanUpAlbumAndParents } from './helpers/albumHelpers';
import { assertDerivedImageDoesNotExist, assertOriginalImageDoesNotExist, uploadImage } from './helpers/s3ImageHelper';

const yearPath = '/1709/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}02-20/`;
const imagePath = `${albumPath}image1.jpg`;
const galleryAppDomain = process.env.GALLERY_APP_DOMAIN;
if (!galleryAppDomain) throw new Error('GALLERY_APP_DOMAIN environment variable is not set');
const cdn = `https://img.${galleryAppDomain}`;
const isProd = galleryAppDomain === 'pix.tacocat.com';
let imageVersionId: string;

/** Headers every response from the CDN must carry, on every cache behavior */
const SHARED_HEADERS: Record<string, string> = {
    'x-robots-tag': 'noindex, noimageindex, noai, noimageai',
    'tdm-reservation': '1',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': isProd ? 'same-site' : 'cross-origin',
};

function expectSharedHeaders(response: Response): void {
    for (const [name, value] of Object.entries(SHARED_HEADERS)) {
        expect(response.headers.get(name)).toBe(value);
    }
    // CloudFront writes includeSubDomains in its own casing; preload must stay off
    const hsts = response.headers.get('strict-transport-security');
    expect(hsts).not.toBeNull();
    expect(hsts).toMatch(/^max-age=31536000; includeSubDomains$/i);
}

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);
    await assertOriginalImageDoesNotExist(imagePath);
    await assertDerivedImageDoesNotExist(imagePath);
    imageVersionId = await uploadImage('image.jpg', imagePath);
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
}, 10000 /* increases Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbumAndParents(albumPath);
}, 10000 /* increases Jest's timeout */);

test('robots.txt allows crawling and disallows AI training bots', async () => {
    const response = await fetch(`${cdn}/robots.txt`, { cache: 'no-store' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
    const body = await response.text();
    expect(body.startsWith('User-agent: *\nAllow: /\n\n')).toBe(true);
    expect(body.endsWith('\nDisallow: /\n')).toBe(true);
    expect(body).toMatch(/^User-agent: GPTBot$/m);
    expect(body).toMatch(/^User-agent: Google-Extended$/m);
    // Exactly one Disallow, and it belongs to the bot group, not the wildcard group
    expect(body.match(/^Disallow:/gm)).toHaveLength(1);
    expectSharedHeaders(response);
});

test('Original image carries the crawler and security headers', async () => {
    const response = await fetch(`${cdn}${imagePath}`, { cache: 'no-store' });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expectSharedHeaders(response);
});

test('Derived image carries the crawler and security headers plus immutable caching', async () => {
    const response = await fetch(`${cdn}/i${imagePath}?version=${imageVersionId}&size=45x45`, { cache: 'no-store' });
    expect(response.status).toBe(200);
    expectSharedHeaders(response);
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
});

test('Video behavior carries the headers even on a function-generated error', async () => {
    // No version: the URL-rewrite CloudFront Function answers 400 itself, never reaching an origin
    const response = await fetch(`${cdn}/v${albumPath}nonexistent.mp4`, { cache: 'no-store' });
    expect(response.status).toBe(400);
    expectSharedHeaders(response);
});
