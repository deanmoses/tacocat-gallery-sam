import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { generateDerivedImage } from './generateDerivedImage';

/**
 * AWS Lambda Function Urls reuse TypeScript types from APIGateway,
 * but many fields aren't used or filled with default values.
 * See: https://docs.aws.amazon.com/lambda/latest/dg/urls-invocation.html
 *
 * It'd be nice to have TypeScript types with only the used fields and add them to:
 * https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/aws-lambda
 */
type LambdaFunctionUrlEvent = APIGatewayProxyEventV2;
type LambdaFunctionUrlResult = APIGatewayProxyStructuredResultV2;
type LambdaFunctionUrlHandler = (event: LambdaFunctionUrlEvent) => Promise<LambdaFunctionUrlResult>;

const internalServerError: LambdaFunctionUrlResult = {
    statusCode: 500,
    headers: {
        'content-type': 'text/plain',
        'cache-control': 'public, max-age=60',
    },
    body: 'internal server error',
    isBase64Encoded: false,
};

/**
 * Lambda to get an original image and create a derived image
 *
 * This lambda is exposed as an AWS Lambda Function URL, meaning it has its own
 * URL endpoint.  This is to allow it to be called by Cloudfront when Cloudfront
 * can't find the derived image in the S3 bucket of derived images.
 */
export const handler: LambdaFunctionUrlHandler = async (event) => {
    const method = event.requestContext.http.method;
    const path = event.rawPath;
    try {
        console.info(JSON.stringify({ event: 'request_received', method, path }));
        return await generateDerivedImage(method, path);
    } catch (err) {
        console.error(JSON.stringify({ event: 'unhandled_error', method, path, error: String(err) }));
        return internalServerError;
    }
};
