/**
 * The API edge cache: album responses served from CloudFront, keyed on the
 * album versions in the KeyValueStore. See template.yaml's AlbumVersionFunction
 * and docs/Architecture.md.
 *
 * The cache lives on the site's distribution, which the test environment does
 * not have, so this suite runs only where SITE_DOMAIN names a site whose API
 * is this stack: staging, by hand.
 */
import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { assertDynamoDBItemDoesNotExist, cleanUpAlbumAndParents } from './helpers/albumHelpers';

const yearAlbumPath = '/1714/'; // unique to this suite, see integrationTestYears.spec.ts
const albumPath = `${yearAlbumPath}04-01/`;
const galleryAppDomain = process.env.GALLERY_APP_DOMAIN;
if (!galleryAppDomain) throw new Error('GALLERY_APP_DOMAIN environment variable is not set');
const siteDomain = process.env.SITE_DOMAIN;
const describeEdge = siteDomain ? describe : describe.skip;

/** The gallery app's URL form, trailing slash and all; the edge function normalizes it */
const apiPath = `/album${albumPath}`;
const direct = `https://api.${galleryAppDomain}${apiPath}`;
const edge = `https://${siteDomain}/api${apiPath}`;

/** How long the stream Lambda plus KeyValueStore propagation get before this suite gives up */
const PROPAGATION_MS = 60_000;

describeEdge('album edge cache', () => {
    beforeAll(async () => {
        await Promise.all([assertDynamoDBItemDoesNotExist(yearAlbumPath), assertDynamoDBItemDoesNotExist(albumPath)]);
        await createAlbum(yearAlbumPath);
        await createAlbum(albumPath);
        // Publish, so the anonymous requests below can see the album
        await updateAlbum(yearAlbumPath, { published: true });
        await updateAlbum(albumPath, { published: true, description: 'Before' });
        // The stream Lambda has to version the new albums before the edge will cache them
        await waitFor(async () =>
            (await fetch(edge, { cache: 'no-store' })).headers.get('cache-control')?.startsWith('public'),
        );
    }, PROPAGATION_MS + 30_000);

    afterAll(async () => {
        await cleanUpAlbumAndParents(albumPath);
    }, 20_000);

    test('reached directly, the API answers with an ETag but forbids shared caching', async () => {
        const response = await fetch(direct, { cache: 'no-store' });
        expect(response.status).toBe(200);
        expect(response.headers.get('etag')).toMatch(/^"[0-9a-f]{16}"$/);
        expect(response.headers.get('cache-control')).toBe('no-store');
    });

    test('reached through the edge, a versioned album is served from cache with the API headers intact', async () => {
        const first = await fetch(edge, { cache: 'no-store' });
        const second = await fetch(edge, { cache: 'no-store' });
        expect(second.status).toBe(200);
        expect(second.headers.get('x-cache')).toBe('Hit from cloudfront');
        expect(second.headers.get('cache-control')).toBe(
            'public, max-age=0, s-maxage=86400, stale-while-revalidate=31536000, stale-if-error=31536000',
        );
        expect(second.headers.get('etag')).toBe(first.headers.get('etag'));
        expect(second.headers.get('x-content-type-options')).toBe('nosniff');
        expect(await second.text()).toBe(await first.text());
    });

    test('the root album is versioned too', async () => {
        const response = await fetch(`https://${siteDomain}/api/album`, { cache: 'no-store' });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe(
            'public, max-age=0, s-maxage=86400, stale-while-revalidate=31536000, stale-if-error=31536000',
        );
    });

    test('the edge answers a matching If-None-Match with 304', async () => {
        const etag = (await fetch(edge, { cache: 'no-store' })).headers.get('etag');
        if (!etag) throw new Error('No ETag');
        const response = await fetch(edge, { cache: 'no-store', headers: { 'If-None-Match': etag } });
        expect(response.status).toBe(304);
        expect(response.headers.get('etag')).toBe(etag);
    });

    test(
        'an edit reaches the edge once the version propagates, and ?fresh at once',
        async () => {
            const before = await fetch(edge, { cache: 'no-store' });
            expect(((await before.json()) as { description: string }).description).toBe('Before');

            await updateAlbum(albumPath, { description: 'After' });

            const fresh = await fetch(`${edge}?fresh`, { cache: 'no-store' });
            expect(fresh.headers.get('x-cache')).toBe('Miss from cloudfront');
            expect(((await fresh.json()) as { description: string }).description).toBe('After');

            let after: Response | undefined;
            await waitFor(async () => {
                after = await fetch(edge, { cache: 'no-store' });
                return ((await after.clone().json()) as { description: string }).description === 'After';
            });
            expect(after?.headers.get('etag')).not.toBe(before.headers.get('etag'));
        },
        PROPAGATION_MS + 30_000,
    );

    test('write methods pass through the edge to the API', async () => {
        // No auth cookie, so the API refuses it; what matters is that the refusal is the API's
        const response = await fetch(edge, {
            method: 'PATCH',
            body: '{}',
            headers: { 'Content-Type': 'application/json' },
        });
        expect(response.status).toBe(401);
    });
});

async function waitFor(condition: () => Promise<boolean | undefined>): Promise<void> {
    const deadline = Date.now() + PROPAGATION_MS;
    while (!(await condition())) {
        if (Date.now() > deadline) throw new Error(`Condition not met within ${PROPAGATION_MS}ms`);
        await new Promise((r) => setTimeout(r, 2000));
    }
}
