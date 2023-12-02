import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    getBodyAsJson,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorized } from '../../lib/lambda_utils/AuthorizationHelpers';
import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';

/**
 * A Lambda function that creates the album in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.PUT);
        ensureAuthorized(event);
        const albumPath = getAlbumPath(event);
        const attributesToSet = getBodyAsJson(event);
        await createAlbum(albumPath, attributesToSet);
        return respondSuccessMessage(event, `Album [${albumPath}] saved`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
