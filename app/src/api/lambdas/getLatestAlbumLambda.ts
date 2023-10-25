import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getLatestAlbum } from '../../lib/gallery/getLatestAlbum/getLatestAlbum';
import { BadRequestException } from '../../lib/api_gateway_utils/BadRequestException';
import { handleHttpExceptions } from '../../lib/api_gateway_utils/ApiGatewayResponseHelpers';

/**
 * A Lambda function that retrieves the latest album in the gallery from DynamoDB.
 *
 * Just retrieves enough information to display a thumbnail: does not retrieve any
 * child photos or child albums.
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        if (event?.httpMethod !== 'GET') {
            throw new BadRequestException('This can only be called from a HTTP GET');
        }

        const tableName = process.env.GALLERY_ITEM_DDB_TABLE;
        if (!tableName) {
            throw 'No GALLERY_ITEM_DDB_TABLE defined';
        }

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
