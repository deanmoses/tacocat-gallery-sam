import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { HttpMethod, ensureHttpMethod, getAlbumPath } from '../../lib/lambda_utils/ApiGatewayRequestHelpers';
import { ServerException } from '../../lib/lambda_utils/ServerException';
import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';

/**
 * A Lambda function that creates the album in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        ensureHttpMethod(event, HttpMethod.PUT);
        const albumPath = getAlbumPath(event);
        const results = await createAlbum(albumPath);
        if (results?.httpStatusCode !== 200) {
            throw new ServerException(`Error saving album; status code [${results?.httpStatusCode}]`);
        }
        return respondSuccessMessage(`Album [${albumPath}] saved`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};