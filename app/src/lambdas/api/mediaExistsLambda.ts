import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondSuccessMessage,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getMediaPath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { mediaExists } from '../../lib/gallery/itemExists/itemExists';
import { isAuthenticatedForReads } from '../../lib/lambda_utils/AuthorizationHelpers';

/**
 * A Lambda function that responds whether a media item (image or video) exists or not
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.HEAD);
        const mediaPath = getMediaPath(event);
        const includeUnpublishedAlbums = isAuthenticatedForReads(event);
        const exists = await mediaExists(mediaPath, includeUnpublishedAlbums);
        return exists ? respondSuccessMessage(event, 'Media Found') : respond404NotFound(event, 'Media Not Found');
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
