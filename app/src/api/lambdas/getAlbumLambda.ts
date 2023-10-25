import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbumAndChildren';
import {
    handleHttpExceptions,
    respond404NotFound,
    respondHttp,
} from '../../lib/api_gateway_utils/ApiGatewayResponseHelpers';
import { BadRequestException } from '../../lib/api_gateway_utils/BadRequestException';

/**
 * A Lambda function that gets an album and its child images and child albums from DynamoDB
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

        const albumPath = event?.pathParameters?.albumPath;
        if (!albumPath) {
            throw new BadRequestException('No album path specified');
        }

        const album = await getAlbumAndChildren(tableName, albumPath);
        if (!album) {
            return respond404NotFound('Album Not Found');
        } else {
            return respondHttp(album);
        }
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
