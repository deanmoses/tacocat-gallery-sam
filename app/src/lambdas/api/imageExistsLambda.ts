import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondSuccessMessage,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getImagePath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { imageExists } from '../../lib/gallery/itemExists/itemExists';
import { isAuthenticated } from '../../lib/lambda_utils/AuthorizationHelpers';

/**
 * A Lambda function that responds whether an image exists or not
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.HEAD);
        const imagePath = getImagePath(event);
        const includeUnpublishedAlbums = await isAuthenticated(event);
        const exists = await imageExists(imagePath, includeUnpublishedAlbums);
        return exists ? respondSuccessMessage(event, 'Image Found') : respond404NotFound(event, 'Image Not Found');
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
