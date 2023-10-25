import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/api_gateway_utils/ApiGatewayResponseHelpers';
import { BadRequestException } from '../../lib/api_gateway_utils/BadRequestException';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';

/**
 * A Lambda that deletes an album from DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        if (event?.httpMethod !== 'DELETE') {
            throw new BadRequestException('This can only be called from a HTTP DELETE');
        }

        const tableName = process.env.GALLERY_ITEM_DDB_TABLE;
        if (!tableName) {
            throw 'No GALLERY_ITEM_DDB_TABLE defined';
        }

        const albumPath = event?.pathParameters?.albumPath;
        if (!albumPath) {
            throw new BadRequestException('No album path specified');
        }

        await deleteAlbum(tableName, albumPath);
        return respondSuccessMessage(`Album [${albumPath}] deleted`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
