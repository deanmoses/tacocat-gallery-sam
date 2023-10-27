import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    getBodyAsJson,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';

/**
 * A Lambda that updates an album's attributes (like title and description) in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.PATCH);
        const albumPath = getAlbumPath(event);
        const attributesToUpdate = getBodyAsJson(event);
        await updateAlbum(albumPath, attributesToUpdate);
        return respondSuccessMessage(`Updated album [${albumPath}]`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
