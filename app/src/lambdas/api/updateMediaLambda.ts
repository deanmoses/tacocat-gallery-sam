import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getBodyAsJson,
    getMediaPath,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorizedForWrites } from '../../lib/lambda_utils/AuthorizationHelpers';
import { updateMedia } from '../../lib/gallery/updateMedia/updateMedia';

/**
 * A Lambda that updates a media item's attributes (like title and description) in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.PATCH);
        await ensureAuthorizedForWrites(event);
        const mediaPath = getMediaPath(event);
        const attributesToUpdate = getBodyAsJson(event);
        await updateMedia(mediaPath, attributesToUpdate);
        return respondSuccessMessage(event, `Updated media [${mediaPath}]`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
