import { APIGatewayProxyEvent } from 'aws-lambda';
import { ALBUM_VERSION_HEADER, respondCacheable } from './ApiGatewayResponseHelpers';

function event(headers: Record<string, string> = {}): APIGatewayProxyEvent {
    return { headers } as unknown as APIGatewayProxyEvent;
}

describe('respondCacheable', () => {
    const body = { path: '/2001/12-31/', children: [] };

    test('returns the body with an ETag', () => {
        const response = respondCacheable(event(), body);
        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual(body);
        expect(response.headers?.['ETag']).toMatch(/^"[0-9a-f]{16}"$/);
    });

    // DynamoDB hands back attributes in a different order on every read
    test('the same data in another key order is the same body and ETag', () => {
        const reordered = { children: [{ b: 1, a: 2 }], path: '/2001/12-31/' };
        const original = respondCacheable(event(), { path: '/2001/12-31/', children: [{ a: 2, b: 1 }] });
        const again = respondCacheable(event(), reordered);
        expect(again.body).toBe(original.body);
        expect(again.headers?.['ETag']).toBe(original.headers?.['ETag']);
    });

    test('is no-store unless the request came through the versioned edge behavior', () => {
        expect(respondCacheable(event(), body).headers?.['Cache-Control']).toBe('no-store');
        expect(respondCacheable(event({ [ALBUM_VERSION_HEADER]: 'abc' }), body).headers?.['Cache-Control']).toBe(
            'public, max-age=0, s-maxage=86400, stale-while-revalidate=31536000, stale-if-error=31536000',
        );
        // CloudFront sends header names capitalized
        expect(respondCacheable(event({ 'X-Album-Version': 'abc' }), body).headers?.['Cache-Control']).toBe(
            'public, max-age=0, s-maxage=86400, stale-while-revalidate=31536000, stale-if-error=31536000',
        );
    });

    test('the ETag follows the body', () => {
        const a = respondCacheable(event(), body).headers?.['ETag'];
        const b = respondCacheable(event(), { ...body, description: 'x' }).headers?.['ETag'];
        expect(a).not.toBe(b);
        expect(respondCacheable(event(), { ...body }).headers?.['ETag']).toBe(a);
    });

    test('answers a matching If-None-Match with a bodiless 304 carrying the same headers', () => {
        const full = respondCacheable(event(), body);
        const etag = full.headers?.['ETag'] as string;
        for (const ifNoneMatch of [etag, `W/${etag}`, `"other", ${etag}`, '*']) {
            const response = respondCacheable(event({ 'If-None-Match': ifNoneMatch }), body);
            expect(response.statusCode).toBe(304);
            expect(response.body).toBe('');
            expect(response.headers).toEqual(full.headers);
        }
    });

    test('a non-matching If-None-Match gets the body', () => {
        const response = respondCacheable(event({ 'if-none-match': '"0000000000000000"' }), body);
        expect(response.statusCode).toBe(200);
    });
});
