import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondHttp } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    getBodyAsJson,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorized } from '../../lib/lambda_utils/AuthorizationHelpers';
import { generateUploadUrls } from '../../lib/gallery/generateUploadUrls/generateUploadUrls';

/**
 * A Lambda that generates presigned URLs for uploading images to S3
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.POST);
        await ensureAuthorized(event);
        const albumPath = getAlbumPath(event);
        const imagePaths: string[] = getBodyAsJson(event);
        const uploadUrls = await generateUploadUrls(albumPath, imagePaths);
        return respondHttp(event, uploadUrls);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
