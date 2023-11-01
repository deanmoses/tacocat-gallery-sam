import { APIGatewayProxyEvent } from 'aws-lambda';
import { BadRequestException } from './BadRequestException';

export enum HttpMethod {
    GET = 'GET',
    PUT = 'PUT',
    PATCH = 'PATCH',
    DELETE = 'DELETE',
}

/**
 * Ensure the request is the specified HTTP method: GET, PUT etc
 *
 * @throws BadRequestException if not
 */
export function ensureHttpMethod(event: APIGatewayProxyEvent, httpMethod: HttpMethod) {
    if (event?.httpMethod !== httpMethod) {
        throw new BadRequestException(`This can only be called from a HTTP ${httpMethod}`);
    }
}

/**
 * Extract the album's path from the URL path

 * @throws BadRequestException if album path isn't there
 */
export function getAlbumPath(event: APIGatewayProxyEvent): string {
    const albumPathParam = event?.pathParameters?.albumPath;
    if (!albumPathParam) {
        throw new BadRequestException('Event does not contain an albumPath parameter');
    }
    return '/' + albumPathParam + '/';
}

/**
 * Extract the image's path from the URL path
 *
 * @throws BadRequestException if there's no path in the event
 */
export function getImagePath(event: APIGatewayProxyEvent): string {
    const imagePath = event?.pathParameters?.imagePath;
    if (!imagePath) {
        throw new BadRequestException('No image path specified');
    }
    return imagePath;
}

export function getBodyAsJson(event: APIGatewayProxyEvent) {
    if (!event?.body) {
        throw new BadRequestException('No HTTP body specified');
    }
    return JSON.parse(event.body);
}
