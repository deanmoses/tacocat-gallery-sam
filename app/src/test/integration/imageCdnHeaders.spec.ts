/**
 * The image CDN's crawler opt-out and security headers and its robots.txt.
 * See template.yaml's response headers policies.
 */
import { getDerivedImageGeneratorDomain, getGalleryAppDomain } from '../../lib/lambda_utils/Env';
import { cleanUpYear, setUpAlbumWithImages } from './helpers/fixtures';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.imageCdnHeaders;
const albumPath = `${yearPath}02-20/`;
const imagePath = `${albumPath}image1.jpg`;
const cdn = `https://img.${getGalleryAppDomain()}`;
let versionId: string;

/** Headers every response from the CDN must carry, on every cache behavior */
const SHARED_HEADERS: Record<string, string> = {
    'x-robots-tag': 'noindex, noimageindex, noai, noimageai',
    'tdm-reservation': '1',
    'x-content-type-options': 'nosniff',
    // same-site in prod only, see the template's response headers policies
    'cross-origin-resource-policy': 'cross-origin',
};

function expectSharedHeaders(response: Response): void {
    for (const [name, value] of Object.entries(SHARED_HEADERS)) {
        expect(response.headers.get(name)).toBe(value);
    }

    // CloudFront writes includeSubDomains in its own casing; preload must stay off
    expect(response.headers.get('strict-transport-security')).toMatch(/^max-age=31536000; includeSubDomains$/i);
}

beforeAll(async () => {
    await cleanUpYear(yearPath);
    const versionIds = await setUpAlbumWithImages(albumPath, { 'image1.jpg': 'images/image.jpg' });
    versionId = versionIds[imagePath];
});

afterAll(() => cleanUpYear(yearPath));

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

test('an original image carries the crawler and security headers', async () => {
    const response = await fetch(`${cdn}${imagePath}`, { cache: 'no-store' });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');

    expectSharedHeaders(response);
});

test('a derived image carries the crawler and security headers plus immutable caching', async () => {
    const response = await fetch(`${cdn}/i${imagePath}?version=${versionId}&size=45x45`, { cache: 'no-store' });

    expect(response.status).toBe(200);

    expectSharedHeaders(response);

    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
});

test('the derived image Lambda URL cannot be called directly', async () => {
    // AuthType AWS_IAM: only CloudFront, signing via its Origin Access Control, may invoke it
    const url = `https://${getDerivedImageGeneratorDomain()}/i${imagePath}/${versionId}/45x45`;
    const response = await fetch(url, { cache: 'no-store' });

    expect(response.status).toBe(403);
});

test('the video behavior carries the headers even on a function-generated error', async () => {
    // No version: the URL-rewrite CloudFront Function answers 400 itself, never reaching an origin
    const response = await fetch(`${cdn}/v${albumPath}nonexistent.mp4`, { cache: 'no-store' });

    expect(response.status).toBe(400);

    expectSharedHeaders(response);
});
