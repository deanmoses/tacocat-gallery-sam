import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getMediaPath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorizedForWrites } from '../../lib/lambda_utils/AuthorizationHelpers';
import { deleteMedia } from '../../lib/gallery/deleteMedia/deleteMedia';

/**
 * A Lambda that deletes a media item (image or video) from DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.DELETE);
        await ensureAuthorizedForWrites(event);
        const mediaPath = getMediaPath(event);
        await deleteMedia(mediaPath);
        return respondSuccessMessage(event, `Media [${mediaPath}] deleted`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
