import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondHttp } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { search } from '../../lib/gallery/search/search';

/**
 * A Lambda function that searches for images and albums in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.GET);
        const searchTerms = event?.pathParameters?.searchTerms;
        const searchResults = await search(searchTerms);
        return respondHttp(searchResults);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
