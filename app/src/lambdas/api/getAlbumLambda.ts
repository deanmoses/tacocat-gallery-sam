import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondCacheable,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { isAuthenticatedForReads } from '../../lib/lambda_utils/AuthorizationHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    logRequestReceived,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';

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
        } else {
            return respondCacheable(event, album);
        }
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
