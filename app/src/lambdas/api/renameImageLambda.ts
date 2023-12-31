import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getBodyAsJson,
    getImagePath,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorized } from '../../lib/lambda_utils/AuthorizationHelpers';
import { renameImage } from '../../lib/gallery/renameImage/renameImage';

/**
 * A Lambda that renames an image in DynamoDB and S3
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.POST);
        await ensureAuthorized(event);
        const imagePath = getImagePath(event);
        const newName = getBodyAsJson(event)?.newName;
        const newImagePath = await renameImage(imagePath, newName);
        return respondSuccessMessage(event, `Renamed image [${imagePath}] to [${newImagePath}]`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
