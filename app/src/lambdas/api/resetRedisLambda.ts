import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { resetAndReloadRedis } from '../../lib/gallery/resetAndReloadRedis/resetAndReloadRedis';

/**
 * A Lambda function that resets and reloads Redis.
 * Deletes all keys and the index, re-creates index, re-loads all the data from DynamoDB.
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.POST);
        await resetAndReloadRedis();
        return respondSuccessMessage(event, 'Redis reset complete');
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
