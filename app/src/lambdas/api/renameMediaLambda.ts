import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getBodyAsJson,
    getMediaPath,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorizedForWrites } from '../../lib/lambda_utils/AuthorizationHelpers';
import { renameMedia } from '../../lib/gallery/renameMedia/renameMedia';

/**
 * A Lambda that renames a media item (image or video) in DynamoDB and S3
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.POST);
        await ensureAuthorizedForWrites(event);
        const mediaPath = getMediaPath(event);
        const newName = getBodyAsJson(event)?.newName;
        const newMediaPath = await renameMedia(mediaPath, newName);
        return respondSuccessMessage(event, `Renamed media [${mediaPath}] to [${newMediaPath}]`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
