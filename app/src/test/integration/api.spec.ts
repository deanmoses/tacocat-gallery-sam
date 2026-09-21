/**
 * The deployed REST API, as the website reaches it: API Gateway routing, the
 * Lambda handlers and their authorization. The other suites call the gallery
 * library in-process and never exercise this layer.
 */
import { getGalleryAppDomain } from '../../lib/lambda_utils/Env';

const api = `https://api.${getGalleryAppDomain()}`;
const jsonBody = { headers: { 'content-type': 'application/json' }, body: '{}' };

async function errorMessageOf(response: Response): Promise<string | undefined> {
    const body = (await response.json()) as { errorMessage?: string };
    return body.errorMessage;
}

describe('without credentials', () => {
    it('the root album is readable', async () => {
        const response = await fetch(`${api}/album`);

        expect(response.status).toBe(200);

        const album = (await response.json()) as { path?: string; children?: unknown[] };

        expect(album.path).toBe('/');
        expect(Array.isArray(album.children)).toBe(true);
    });

    it('an album that does not exist is a 404', async () => {
        const response = await fetch(`${api}/album/1600/01-01/`);

        expect(response.status).toBe(404);
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
    ])('%s %s is rejected as unauthorized', async (method, path) => {
        const response = await fetch(`${api}${path}`, { method, ...jsonBody });

        expect(response.status).toBe(401);
        await expect(errorMessageOf(response)).resolves.toMatch(/unauthorized/i);
    });
});
