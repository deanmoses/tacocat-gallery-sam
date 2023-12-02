import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondSuccessMessage,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getAlbumPath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { albumExists } from '../../lib/gallery/itemExists/itemExists';
import { isAuthenticated } from '../../lib/lambda_utils/AuthorizationHelpers';

/**
 * A Lambda function that responds whether an album exists or not
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.HEAD);
        const albumPath = getAlbumPath(event);
        const includeUnpublishedAlbums = await isAuthenticated(event);
        const exists = await albumExists(albumPath, includeUnpublishedAlbums);
        return exists ? respondSuccessMessage(event, 'Album Found') : respond404NotFound(event, 'Album Not Found');
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
