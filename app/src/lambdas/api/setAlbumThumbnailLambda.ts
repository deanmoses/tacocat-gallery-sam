import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    getBodyAsObject,
    getStringField,
    logRequestReceived,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorizedForWrites } from '../../lib/lambda_utils/AuthorizationHelpers';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';

/**
 * A Lambda function that sets an album's thumbnail to the specified image
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        logRequestReceived(event);
        ensureHttpMethod(event, HttpMethod.PATCH);
        await ensureAuthorizedForWrites(event);
        const albumPath = getAlbumPath(event);
        const mediaPath = getStringField(getBodyAsObject(event), 'mediaPath');
        await setAlbumThumbnail(albumPath, mediaPath);
        return respondSuccessMessage(event, `Album [${albumPath}] thumbnail set to [${mediaPath}]`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
