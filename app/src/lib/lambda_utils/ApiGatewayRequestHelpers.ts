import { APIGatewayProxyEvent } from 'aws-lambda';
import { BadRequestException } from './BadRequestException';

export enum HttpMethod {
    HEAD = 'HEAD',
    GET = 'GET',
    PUT = 'PUT',
    PATCH = 'PATCH',
    POST = 'POST',
    DELETE = 'DELETE',
}

/**
 * Ensure the request is the specified HTTP method: GET, PUT etc
 *
 * @throws BadRequestException if not
 */
export function ensureHttpMethod(event: APIGatewayProxyEvent, httpMethod: HttpMethod) {
    if (event?.httpMethod !== String(httpMethod)) {
        throw new BadRequestException(`This can only be called from a HTTP ${httpMethod}`);
    }
}

/**
 * Extract the album's path from the URL path
 * If not there, return root path
 */
export function getAlbumPath(event: APIGatewayProxyEvent): string {
    const albumPathParam = event?.pathParameters?.albumPath;
    if (!albumPathParam) {
        return '/';
    }
    return '/' + albumPathParam + '/';
}

/**
 * Extract the media's path from the URL path
 *
 * @throws BadRequestException if there's no path in the event
 */
export function getMediaPath(event: APIGatewayProxyEvent): string {
    const mediaPathParam = event?.pathParameters?.mediaPath;
    if (!mediaPathParam) {
        throw new BadRequestException('Event does not contain a mediaPath parameter');
    }
    return '/' + mediaPathParam;
}

/**
 * Parse the request's body as JSON.
 *
 * Returns `unknown` on purpose: the body comes off the wire, so nothing is known
 * about its shape until it's checked. Callers should use one of the
 * getBodyAs...() functions below rather than this one.
 *
 * @throws BadRequestException if there's no body, or it isn't valid JSON
 */
export function getBodyAsJson(event: APIGatewayProxyEvent): unknown {
    if (!event?.body) {
        throw new BadRequestException('No HTTP body specified');
    }
    try {
        return JSON.parse(event.body);
    } catch {
        throw new BadRequestException('HTTP body is not valid JSON');
    }
}

/**
 * Parse the request's body as a JSON object, like {"newName": "felix.jpg"}
 *
 * @throws BadRequestException if the body isn't a JSON object
 */
export function getBodyAsObject(event: APIGatewayProxyEvent): Record<string, unknown> {
    const body = getBodyAsJson(event);
    if (!isJsonObject(body)) {
        throw new BadRequestException('HTTP body must be a JSON object');
    }
    return body;
}

/**
 * Parse the request's body as a JSON array of strings, like ["/2001/12-31/felix.jpg"]
 *
 * @throws BadRequestException if the body isn't a JSON array of strings
 */
export function getBodyAsStringArray(event: APIGatewayProxyEvent): string[] {
    const body = getBodyAsJson(event);
    if (!isJsonArray(body) || !body.every((entry) => typeof entry === 'string')) {
        throw new BadRequestException('HTTP body must be a JSON array of strings');
    }
    return body;
}

/**
 * Parse the request's body as a bag of attributes to set on an album or media
 * item, like {"description": "Felix", "published": true}
 *
 * This checks only the shape: that it's a JSON object of strings and booleans.
 * Which attribute names are allowed, and what their values may be, is the
 * business logic's job.
 *
 * @throws BadRequestException if the body isn't a JSON object of strings and booleans
 */
export function getBodyAsAttributes(event: APIGatewayProxyEvent): Record<string, string | boolean> {
    const body = getBodyAsObject(event);
    const attributes: Record<string, string | boolean> = {};
    for (const [name, value] of Object.entries(body)) {
        if (typeof value !== 'string' && typeof value !== 'boolean') {
            throw new BadRequestException(`Attribute [${name}] must be a string or a boolean`);
        }
        attributes[name] = value;
    }
    return attributes;
}

/**
 * Extract a string field from an already-parsed JSON body
 *
 * @throws BadRequestException if the field is missing or isn't a string
 */
export function getStringField(body: Record<string, unknown>, fieldName: string): string {
    const value = body[fieldName];
    if (typeof value !== 'string') {
        throw new BadRequestException(`HTTP body must contain a [${fieldName}] string`);
    }
    return value;
}

/**
 * Extract a number field from an already-parsed JSON body
 *
 * @throws BadRequestException if the field is missing or isn't a number
 */
export function getNumberField(body: Record<string, unknown>, fieldName: string): number {
    const value = body[fieldName];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequestException(`HTTP body must contain a [${fieldName}] number`);
    }
    return value;
}

/**
 * Extract an array-of-strings field from an already-parsed JSON body
 *
 * @throws BadRequestException if the field is missing or isn't an array of strings
 */
export function getStringArrayField(body: Record<string, unknown>, fieldName: string): string[] {
    const value = body[fieldName];
    if (!isJsonArray(value) || !value.every((entry) => typeof entry === 'string')) {
        throw new BadRequestException(`HTTP body must contain a [${fieldName}] array of strings`);
    }
    return value;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}
