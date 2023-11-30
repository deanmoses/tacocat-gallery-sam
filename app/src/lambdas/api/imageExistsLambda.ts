import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondSuccessMessage,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getImagePath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';

/**
 * A Lambda function that responds whether an image exists or not
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.HEAD);
        const imagePath = getImagePath(event);
        const imageExists = await itemExists(imagePath);
        return imageExists ? respondSuccessMessage(event, 'Image Found') : respond404NotFound(event, 'Image Not Found');
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
