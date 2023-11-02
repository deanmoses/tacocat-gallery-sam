import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getImagePath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';

/**
 * A Lambda that deletes an image from DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.DELETE);
        const imagePath = getImagePath(event);
        console.info(`Deleting image [${imagePath}]...`);
        await deleteImage(imagePath);
        return respondSuccessMessage(`Image [${imagePath}] deleted`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
