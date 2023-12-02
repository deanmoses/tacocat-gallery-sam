import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondHttp,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { isAuthenticated } from '../../lib/lambda_utils/AuthorizationHelpers';
import { HttpMethod, ensureHttpMethod, getAlbumPath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';

/**
 * A Lambda function that gets an album and its child images and child albums from DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.GET);
        const albumPath = getAlbumPath(event);
        const includeUnpublishedAlbums = await isAuthenticated(event);
        const album = await getAlbumAndChildren(albumPath, includeUnpublishedAlbums);
        if (!album) {
            return respond404NotFound(event, 'Album Not Found');
        } else {
            return respondHttp(event, album);
        }
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
