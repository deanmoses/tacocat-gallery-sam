import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/**
 * AWS Lambda Function Urls reuse TypeScript types from APIGateway, but
 * many fields aren't used or filled with default values.
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
 * URL endpoint.
 */
export const handler = async (event: LambdaFunctionUrlEvent): Promise<LambdaFunctionUrlResult> => {
    console.log('getDerivedImageLambda event', event);

    return {
        statusCode: 200,
        headers: {
            'content-type': 'text/plain',
        },
        body: 'Hello World',
        isBase64Encoded: false,
    };
};
