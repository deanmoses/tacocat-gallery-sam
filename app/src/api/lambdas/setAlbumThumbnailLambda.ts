import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    getBodyAsJson,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';

/**
 * A Lambda function that sets an album's thumbnail to the specified image
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.PATCH);
        const albumPath = getAlbumPath(event);
        const body = getBodyAsJson(event);
        const imagePath = body.imagePath;
        await setAlbumThumbnail(albumPath, imagePath);
        return respondSuccessMessage(`Album [${albumPath}] thumbnail set to [${imagePath}]`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
