import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondHttp,
} from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getMediaPath,
    logRequestReceived,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { mediaExists } from '../../lib/gallery/itemExists/itemExists';
import { AUTH_STATUS_HEADER, getReadAuthStatus } from '../../lib/lambda_utils/AuthorizationHelpers';

/**
 * A Lambda function that responds whether a media item (image or video) exists or not
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        logRequestReceived(event);
        ensureHttpMethod(event, HttpMethod.HEAD);
        const mediaPath = getMediaPath(event);
        const authStatus = await getReadAuthStatus(event);
        const exists = await mediaExists(mediaPath, authStatus === 'valid');
        const headers = { [AUTH_STATUS_HEADER]: authStatus };
        return exists
            ? respondHttp(event, { success: true, message: 'Media Found' }, 200, headers)
            : respond404NotFound(event, 'Media Not Found', headers);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
