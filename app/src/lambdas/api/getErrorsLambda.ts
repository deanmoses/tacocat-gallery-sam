import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondHttp } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getBodyAsJson } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ensureAuthorizedForWrites } from '../../lib/lambda_utils/AuthorizationHelpers';
import { getErrors, GetErrorsRequest } from '../../lib/gallery/getErrors/getErrors';

/**
 * A Lambda that retrieves errors for a batch of paths.
 * Used by the frontend to check which uploads have failed.
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.POST);
        await ensureAuthorizedForWrites(event);
        const request: GetErrorsRequest = getBodyAsJson(event);
        const paths = request?.paths || [];
        const result = await getErrors(paths);
        return respondHttp(event, result);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
