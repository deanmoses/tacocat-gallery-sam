import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondHttp } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { getLatestAlbum } from '../../lib/gallery/getLatestAlbum/getLatestAlbum';
import { getDynamoDbTableName } from '../../lib/lambda_utils/Env';

/**
 * A Lambda function that retrieves the latest album in the gallery from DynamoDB.
 *
 * Just retrieves enough information to display a thumbnail: does not retrieve any
 * child photos or child albums.
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.GET);
        const tableName = getDynamoDbTableName();

        const album = await getLatestAlbum(tableName);
        if (!album) {
            return respondHttp({});
        } else {
            return respondHttp(album);
        }
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
