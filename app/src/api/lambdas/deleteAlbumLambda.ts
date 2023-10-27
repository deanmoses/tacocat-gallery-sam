import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getAlbumPath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';
import { getDynamoDbTableName } from '../../lib/lambda_utils/Env';

/**
 * A Lambda that deletes an album from DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.DELETE);
        const tableName = getDynamoDbTableName();
        const albumPath = getAlbumPath(event);

        await deleteAlbum(tableName, albumPath);
        return respondSuccessMessage(`Album [${albumPath}] deleted`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
