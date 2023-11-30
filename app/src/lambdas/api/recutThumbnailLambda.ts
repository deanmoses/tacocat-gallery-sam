import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getBodyAsJson,
    getImagePath,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { recutThumbnail } from '../../lib/gallery/recutThumbnail/recutThumbnail';
import { Rectangle } from '../generateDerivedImage/focusCrop';

/**
 * A Lambda function that stores thumbnail re-cut info about an image in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.PATCH);
        const imagePath = getImagePath(event);
        const crop: Rectangle = getBodyAsJson(event);
        await recutThumbnail(imagePath, crop);
        return respondSuccessMessage(event, `Image [${imagePath}] thumbnail re-cut]`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
