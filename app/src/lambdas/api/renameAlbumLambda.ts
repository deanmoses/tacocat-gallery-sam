import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    getBodyAsJson,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorized } from '../../lib/lambda_utils/AuthorizationHelpers';
import { renameAlbum } from '../../lib/gallery/renameAlbum/renameAlbum';

/**
 * A Lambda that renames an album in DynamoDB and S3
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.POST);
        await ensureAuthorized(event);
        const albumPath = getAlbumPath(event);
        const newName = getBodyAsJson(event)?.newName;
        const newAlbumPath = await renameAlbum(albumPath, newName);
        return respondSuccessMessage(event, `Renamed album [${albumPath}] to [${newAlbumPath}]`);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
