import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { parsePath } from './parsePath';
import { loadOriginalImage, saveOptimizedImage } from './s3';
import { optimizeImage } from './optimizeImage';

/**
 * AWS Lambda Function Urls reuse TypeScript types from APIGateway,
 * but many fields aren't used or filled with default values.
 * See: https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html
 *
 * It'd be nice to have TypeScript types with only the used fields and add them to:
 * https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/aws-lambda
 */
export type LambdaFunctionUrlEvent = APIGatewayProxyEventV2;
export type LambdaFunctionUrlResult = APIGatewayProxyStructuredResultV2;

/**
 * Lambda to get an original image and create a derived image
 *
 * This lambda is exposed as an AWS Lambda Function URL, meaning it has its own
 * URL endpoint.  This is to allow it to be called by Cloudfront when Cloudfront
 * can't find the derived image in the S3 bucket of derived images.
 */
export const handler = async (event: LambdaFunctionUrlEvent): Promise<LambdaFunctionUrlResult> => {
    //console.debug('Generate Derived Image: event', event);
    try {
        const method = event.requestContext.http.method;
        const path = event.rawPath;
        console.info(`Generate Derived Image: ${method} ${path}`);
        return await handleRequest(method, path);
    } catch (err) {
        console.error(err);
        return internalServerError;
    }
};

export async function handleRequest(method: string, path: string): Promise<LambdaFunctionUrlResult> {
    if (!['GET', 'HEAD'].includes(method)) return methodNotAllowed;

    if (path.includes('favico')) return notFound;

    const { id, versionId, error, ...params } = parsePath(path);
    if (error) {
        console.error('Generate Derived Image: error: ' + error);
    }
    if (error) return badRequest;
    if (!versionId) return badRequest;
    if (!id) return notFound;

    const original = await loadOriginalImage(id, versionId);
    if (!original) return notFound;

    const { buffer, format } = await optimizeImage(original, params);

    const contentType = `image/${format}`;
    const headers = { 'content-type': contentType, 'cache-control': cacheControl };
    const save = saveOptimizedImage(path, buffer, contentType, cacheControl);
    const body = buffer.toString('base64'); // do base64 encoding in parallel to saving
    await save;

    if (method === 'HEAD') return { statusCode: 200, headers };
    if (body.length > 5 * 1024 * 1024) return retryLater; // can't return large response via lambda, subsequent requests will be served from S3
    return { statusCode: 200, headers, body, isBase64Encoded: true };
}

const textResponse = (statusCode: number, body: string) => ({
    statusCode,
    headers: {
        'content-type': 'text/plain',
        'cache-control': `public, max-age=${statusCode < 500 ? 300 : 60}`,
    },
    body,
    isBase64Encoded: false,
});
const cacheControl = 'public, max-age=123';
const badRequest = textResponse(400, 'bad request');
//const forbidden = textResponse(403, 'forbidden');
const notFound = textResponse(404, 'not found');
const methodNotAllowed = textResponse(405, 'method not allowed');
const internalServerError = textResponse(500, 'internal server error');
const retryLater = {
    statusCode: 503,
    headers: { 'retry-after': '1', 'cache-control': 'no-cache, no-store' },
};
