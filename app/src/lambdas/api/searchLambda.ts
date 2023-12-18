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
        const encodedSearchTerms = event?.pathParameters?.searchTerms;
        const searchTerms = !!encodedSearchTerms ? decodeURIComponent(encodedSearchTerms) : undefined;
        const searchResults = await search(searchTerms);
        return respondHttp(event, searchResults);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
