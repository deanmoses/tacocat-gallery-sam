import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getBodyAsJson,
    getImagePath,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorized } from '../../lib/lambda_utils/AuthorizationHelpers';
import { updateImage } from '../../lib/gallery/updateImage/updateImage';

/**
 * A Lambda that updates an image's attributes (like title and description) in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.PATCH);
        await ensureAuthorized(event);
        const imagePath = getImagePath(event);
        const attributesToUpdate = getBodyAsJson(event);
        await updateImage(imagePath, attributesToUpdate);
        return respondSuccessMessage(event, `Updated image [${imagePath}]`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
