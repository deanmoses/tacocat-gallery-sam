import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondHttp,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    logRequestReceived,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { albumExists } from '../../lib/gallery/itemExists/itemExists';
import { AUTH_STATUS_HEADER, getReadAuthStatus } from '../../lib/lambda_utils/AuthorizationHelpers';

/**
 * A Lambda function that responds whether an album exists or not
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        logRequestReceived(event);
        ensureHttpMethod(event, HttpMethod.HEAD);
        const albumPath = getAlbumPath(event);
        const authStatus = await getReadAuthStatus(event);
        const exists = await albumExists(albumPath, authStatus === 'valid');
        const headers = { [AUTH_STATUS_HEADER]: authStatus };
        return exists
            ? respondHttp(event, { success: true, message: 'Album Found' }, 200, headers)
            : respond404NotFound(event, 'Album Not Found', headers);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
