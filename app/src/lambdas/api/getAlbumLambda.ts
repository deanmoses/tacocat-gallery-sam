import type { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondHttp,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { AUTH_STATUS_HEADER, getReadAuthStatus } from '../../lib/lambda_utils/AuthorizationHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    logRequestReceived,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';

/**
 * A Lambda function that gets an album and its child images and child albums from DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        logRequestReceived(event);
        ensureHttpMethod(event, HttpMethod.GET);
        const albumPath = getAlbumPath(event);
        // Token verification runs alongside the DynamoDB reads; only the
        // filtering of what came back waits on it
        const authStatus = getReadAuthStatus(event);
        const album = await getAlbumAndChildren(
            albumPath,
            authStatus.then((status) => status === 'valid'),
        );
        const headers = { [AUTH_STATUS_HEADER]: await authStatus };
        if (!album) {
            return respond404NotFound(event, 'Album Not Found', headers);
        } else {
            return respondHttp(event, album, 200, headers);
        }
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
