import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import {
    HttpMethod,
    ensureHttpMethod,
    getAlbumPath,
    getBodyAsJson,
} from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { getDynamoDbTableName } from '../../lib/lambda_utils/Env';

/**
 * A Lambda that updates an album's attributes (like title and description) in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.PATCH);
        const tableName = getDynamoDbTableName();
        const albumPath = getAlbumPath(event);
        const attributesToUpdate = getBodyAsJson(event);
        await updateAlbum(tableName, albumPath, attributesToUpdate);
        return respondSuccessMessage(`Updated album [${albumPath}]`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
