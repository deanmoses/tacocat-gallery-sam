import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondSuccessMessage,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getAlbumPath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';

/**
 * A Lambda function that responds whether an album exists or not
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.HEAD);
        const albumPath = getAlbumPath(event);
        const albumExists = await itemExists(albumPath);
        return albumExists ? respondSuccessMessage('Album Found') : respond404NotFound('Album Not Found');
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
