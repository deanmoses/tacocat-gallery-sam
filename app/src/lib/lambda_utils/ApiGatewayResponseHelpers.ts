import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { NotFoundException } from './NotFoundException';
import { BadRequestException } from './BadRequestException';
import { UnauthorizedException } from './UnauthorizedException';
import { ServerException } from './ServerException';
import { getGalleryAppDomain } from './Env';
import { getHeader } from './HttpHeaders';
import { shortHash } from '../hash_utils/hash';

/**
 * Request header the API edge cache's viewer-request function sets to the
 * album version it keyed the cache on. Its presence is the origin's signal
 * that a cache in front of it knows how to tell one version of a response
 * from the next; without it a response must not be cached by anything shared.
 */
export const ALBUM_VERSION_HEADER = 'x-album-version';

/** How long the CDN may serve a versioned response before revalidating */
const EDGE_MAX_AGE_SECONDS = 86400;

/**
 * How long past that the CDN may keep serving the entry while it refreshes
 * in the background, or while the origin is failing. The version in the
 * cache key is what keeps an entry current, so a stale one is only wrong
 * after a version update was dropped, and its first request past
 * EDGE_MAX_AGE_SECONDS still triggers the refresh; this just takes the
 * origin round trip off that request's critical path.
 */
const EDGE_STALE_SECONDS = 30 * 86400;

const EDGE_CACHE_CONTROL =
    `public, max-age=0, s-maxage=${EDGE_MAX_AGE_SECONDS}, ` +
    `stale-while-revalidate=${EDGE_STALE_SECONDS}, stale-if-error=${EDGE_STALE_SECONDS}`;

/**
 * Create a 200 OK API Gateway lambda function response
 */
export function respondSuccessMessage(event: APIGatewayProxyEvent, successMessage: string): APIGatewayProxyResult {
    return respondHttp(event, {
        success: true,
        message: successMessage,
    });
}

/**
 * Create a 404 Not Found API Gateway lambda function response
 */
export function respond404NotFound(event: APIGatewayProxyEvent, message: string): APIGatewayProxyResult {
    return respondHttp(event, { message: !message ? 'Not Found' : message }, 404);
}

/**
 * Create an API Gateway lambda function response
 */
export function respondHttp(_event: APIGatewayProxyEvent, body: object, statusCode = 200): APIGatewayProxyResult {
    return {
        isBase64Encoded: false,
        statusCode: statusCode,
        body: JSON.stringify(body),
        headers: responseHeaders(),
    };
}

/**
 * Create a 200 OK response that a CDN can cache and a client can revalidate.
 *
 * The ETag is a hash of the body. A request whose If-None-Match carries it
 * gets a bodiless 304 instead: the DynamoDB work has been done by then, but
 * the transfer is saved, and it is what CloudFront sends when revalidating
 * an expired cache entry.
 *
 * Cache-Control depends on who is asking. Behind the edge cache's versioned
 * behavior (see ALBUM_VERSION_HEADER) the response may be held by shared
 * caches for a day and served stale for a month after that while it is
 * refreshed; the version in the cache key, not these TTLs, is what keeps it
 * current. Reached any other way the response is no-store, because the body
 * depends on the auth cookie and nothing else in the path knows that.
 * max-age=0 keeps browsers revalidating either way, so an edge hit on a
 * conditional request costs a 304 rather than a body.
 */
export function respondCacheable(event: APIGatewayProxyEvent, body: object): APIGatewayProxyResult {
    const json = JSON.stringify(body);
    const etag = `"${shortHash(json)}"`;
    const versioned = !!getHeader(event, ALBUM_VERSION_HEADER);
    const headers = {
        ...responseHeaders(),
        ETag: etag,
        'Cache-Control': versioned ? EDGE_CACHE_CONTROL : 'no-store',
    };
    if (ifNoneMatchMatches(getHeader(event, 'if-none-match'), etag)) {
        return { isBase64Encoded: false, statusCode: 304, body: '', headers };
    }
    return { isBase64Encoded: false, statusCode: 200, body: json, headers };
}

/**
 * True if the If-None-Match header names the ETag. Handles the comma-separated
 * list form, the W/ weak prefix (API Gateway compresses the body without
 * touching the ETag, so a weak match is the honest one) and the * wildcard.
 */
function ifNoneMatchMatches(ifNoneMatch: string | undefined, etag: string): boolean {
    if (!ifNoneMatch) return false;
    if (ifNoneMatch.trim() === '*') return true;
    return ifNoneMatch
        .split(',')
        .map((candidate) => candidate.trim().replace(/^W\//, ''))
        .includes(etag);
}

function responseHeaders(): Record<string, string> {
    return {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'HEAD, GET, OPTIONS, POST, PUT, PATCH, DELETE',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Origin': `https://${getGalleryAppDomain()}`,
        // Lets the gallery app read this response's full Resource Timing entry
        // (DNS/TCP/TLS, nextHopProtocol, transferSize). Without it the browser
        // zeroes those out for cross-origin responses. Separate from CORS above:
        // that governs reading the body, this governs reading the timings.
        'Timing-Allow-Origin': `https://${getGalleryAppDomain()}`,
        // Keep API responses out of search results. robots.txt and
        // X-Robots-Tag are per host, so the gallery app's noindex says
        // nothing about api.*; this is the API's own opt-out.
        'X-Robots-Tag': 'noindex',
        // Never let a browser sniff a JSON body into something executable.
        'X-Content-Type-Options': 'nosniff',
    };
}

/**
 * Turn the exception into a lambda function response of the format that
 * the API Gateway will understand.
 */
export function handleHttpExceptions(event: APIGatewayProxyEvent, e: unknown): APIGatewayProxyResult {
    if (e instanceof BadRequestException) {
        return respondHttp(event, { errorMessage: e.message }, 400);
    } else if (e instanceof NotFoundException) {
        return respond404NotFound(event, e.message);
    } else if (e instanceof UnauthorizedException) {
        return respondHttp(event, { errorMessage: e.message }, 401);
    } else if (e instanceof ServerException) {
        console.error({ event: 'server_exception', path: event.path, method: event.httpMethod, error: e.message });
        return respondHttp(event, { errorMessage: e.message }, 500);
    } else {
        console.error({
            event: 'unexpected_exception',
            path: event.path,
            method: event.httpMethod,
            error: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
        });
        // If we let the API Gateway handle the exception, it won't
        // include the CORS headers and it'll look to the browser like
        // a CORS error.
        return respondHttp(event, { errorMessage: 'Server Error' }, 500);
    }
}
