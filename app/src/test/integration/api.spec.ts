/**
 * The deployed REST API, as the website reaches it: API Gateway routing, the
 * Lambda handlers and their authorization. The other suites call the gallery
 * library in-process and never exercise this layer.
 */
import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { getGalleryAppDomain } from '../../lib/lambda_utils/Env';
import { cleanUpYear } from './helpers/fixtures';
import { TEST_YEARS } from './helpers/testYears';

const api = `https://api.${getGalleryAppDomain()}`;
const jsonBody = { headers: { 'content-type': 'application/json' }, body: '{}' };
const yearPath = TEST_YEARS.api;
const albumPath = `${yearPath}03-15/`;

async function errorMessageOf(response: Response): Promise<string | undefined> {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage;
}

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await createAlbum(yearPath, { published: true });
    await createAlbum(albumPath, { published: true });
});

afterAll(() => cleanUpYear(yearPath));

describe('without credentials', () => {
    it('the root album is readable', async () => {
        const response = await fetch(`${api}/album`);

        expect(response.status).toBe(200);
        expect(response.headers.get('x-auth-status')).toBe('none');

        const album = (await response.json()) as { path?: string; children?: unknown[] };

        expect(album.path).toBe('/');
        expect(Array.isArray(album.children)).toBe(true);
    });

    it('a published album is readable', async () => {
        const response = await fetch(`${api}/album${albumPath}`);

        expect(response.status).toBe(200);

        const album = (await response.json()) as { path?: string };

        expect(album.path).toBe(albumPath);
    });

    it('an album that does not exist is a 404', async () => {
        const response = await fetch(`${api}/album/1600/01-01/`);

        expect(response.status).toBe(404);
    });

    it('a published album exists', async () => {
        const response = await fetch(`${api}/album${albumPath}`, { method: 'HEAD' });

        expect(response.status).toBe(200);
        expect(response.headers.get('x-auth-status')).toBe('none');
    });

    it('an album that does not exist does not exist', async () => {
        const response = await fetch(`${api}/album/1600/01-01/`, { method: 'HEAD' });

        expect(response.status).toBe(404);
    });

    it('media that does not exist does not exist', async () => {
        const response = await fetch(`${api}/media${albumPath}image.jpg`, { method: 'HEAD' });

        expect(response.status).toBe(404);
    });

    it('the latest album is readable', async () => {
        const response = await fetch(`${api}/latest-album`);

        expect(response.status).toBe(200);

        // Empty when the gallery has no published album, which a wiped test stack may not
        const album = (await response.json()) as { path?: string };

        expect(album.path ?? '').toMatch(/^$|^\/\d{4}\/\d{2}-\d{2}\/$/);
    });

    it('search is readable', async () => {
        // The other suites' fixtures come and go, so only the shape is stable
        const response = await fetch(`${api}/search/${encodeURIComponent('Image Title')}?oldest=1700&newest=1799`);

        expect(response.status).toBe(200);

        const results = (await response.json()) as { total?: number; items?: unknown[] };

        expect(results.total).toStrictEqual(expect.any(Number));
        expect(Array.isArray(results.items)).toBe(true);
    });

    it.each([
        ['PUT', '/album/1600/01-01/'],
        ['PATCH', '/album/1600/01-01/'],
        ['DELETE', '/album/1600/01-01/'],
        ['PATCH', '/media/1600/01-01/image.jpg'],
        ['DELETE', '/media/1600/01-01/image.jpg'],
        ['POST', '/album-rename/1600/01-01/'],
        ['POST', '/media-rename/1600/01-01/image.jpg'],
        ['PATCH', '/album-thumb/1600/01-01/'],
        ['PATCH', '/thumb/1600/01-01/image.jpg'],
        ['POST', '/presigned/1600/01-01/'],
        ['POST', '/errors'],
    ])('%s %s is rejected as unauthorized', async (method, path) => {
        const response = await fetch(`${api}${path}`, { method, ...jsonBody });

        expect(response.status).toBe(401);
        await expect(errorMessageOf(response)).resolves.toMatch(/unauthorized/i);
    });
});
