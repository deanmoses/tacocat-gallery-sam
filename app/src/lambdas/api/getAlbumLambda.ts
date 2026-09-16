import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    ALBUM_VERSION_HEADER,
    EDGE_HANDLED_HEADER,
    handleHttpExceptions,
    respond404NotFound,
    respondCacheable,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { getHeader } from '../../lib/lambda_utils/HttpHeaders';
import { isAuthenticatedForReads } from '../../lib/lambda_utils/AuthorizationHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    logRequestReceived,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { recordFirstAlbumVersion } from '../../lib/gallery/getAlbum/albumVersion';

/**
 * A Lambda function that gets an album and its child images and child albums from DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        logRequestReceived(event);
        ensureHttpMethod(event, HttpMethod.GET);
        const albumPath = getAlbumPath(event);
        const includeUnpublishedAlbums = isAuthenticatedForReads(event);
        const album = await getAlbumAndChildren(albumPath, includeUnpublishedAlbums);
        if (!album) {
            return respond404NotFound(event, 'Album Not Found');
        }
        const response = respondCacheable(event, album);
        if (getHeader(event, EDGE_HANDLED_HEADER) && !getHeader(event, ALBUM_VERSION_HEADER)) {
            await recordFirstAlbumVersion(albumPath, String(response.headers?.['ETag'] ?? ''));
        }
        return response;
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
