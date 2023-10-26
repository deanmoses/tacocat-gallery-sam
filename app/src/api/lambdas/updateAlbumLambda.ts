import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/api_gateway_utils/ApiGatewayResponseHelpers';
import { BadRequestException } from '../../lib/api_gateway_utils/BadRequestException';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';

/**
 * A Lambda that updates an album's attributes (like title and description) in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        if (event?.httpMethod !== 'PATCH') {
            throw new BadRequestException('This can only be called from a HTTP PATCH');
        }

        const tableName = process.env.GALLERY_ITEM_DDB_TABLE;
        if (!tableName) {
            throw 'No GALLERY_ITEM_DDB_TABLE defined';
        }

        const albumPath = event?.pathParameters?.albumPath;
        if (!albumPath) {
            throw new BadRequestException('No album path specified');
        }

        if (!event?.body) {
            throw new BadRequestException('No HTTP body specified');
        }
        const attributesToUpdate = JSON.parse(event.body);

        await updateAlbum(tableName, albumPath, attributesToUpdate);
        return respondSuccessMessage(`Updated album [${albumPath}]`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
