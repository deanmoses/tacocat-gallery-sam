import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getAlbumPath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorized } from '../../lib/lambda_utils/AuthorizationHelpers';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';

/**
 * A Lambda that deletes an album from DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.DELETE);
        ensureAuthorized(event);
        const albumPath = getAlbumPath(event);
        await deleteAlbum(albumPath);
        return respondSuccessMessage(event, `Album [${albumPath}] deleted`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
