import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getBodyAsJson,
    getImagePath,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { recutThumbnail } from '../../lib/gallery/recutThumbnail/recutThumbnail';

/**
 * Generate a thumbnail of an image stored in s3 and
 * store the thumbnail back in the same bucket
 * under the "Thumbnail/" prefix.
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.PATCH);
        const imagePath = getImagePath(event);
        const crop = getBodyAsJson(event);
        await recutThumbnail(imagePath, crop);
        return respondSuccessMessage(`Image [${imagePath}] thumbnail updated]`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
