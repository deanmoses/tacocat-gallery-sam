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
        const searchResults = await search({
            terms: !!encodedSearchTerms ? decodeURIComponent(encodedSearchTerms) : undefined,
            oldestYear: event?.queryStringParameters?.oldest,
            newestYear: event?.queryStringParameters?.newest,
            oldestFirst: event?.queryStringParameters?.oldestFirst,
        });
        return respondHttp(event, searchResults);
    } catch (e) {
        return handleHttpExceptions(event, e);
    }
};
