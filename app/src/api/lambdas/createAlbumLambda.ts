import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/api_gateway_utils/ApiGatewayResponseHelpers';
import { BadRequestException } from '../../lib/api_gateway_utils/BadRequestException';

/**
 * A Lambda function that creates the album in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        if (event?.httpMethod !== 'PUT') {
            throw new BadRequestException('This can only be called from a HTTP PUT');
        }

        const tableName = process.env.GALLERY_ITEM_DDB_TABLE;
        if (!tableName) {
            throw 'No GALLERY_ITEM_DDB_TABLE defined';
        }

        const albumPath = event?.pathParameters?.albumPath;
        if (!albumPath) {
            throw new BadRequestException('No album path specified');
        }

        const results = await createAlbum(tableName, albumPath);
        if (results?.httpStatusCode !== 200) throw 'Error saving album';

        return respondSuccessMessage(`Album [${albumPath}] saved`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
