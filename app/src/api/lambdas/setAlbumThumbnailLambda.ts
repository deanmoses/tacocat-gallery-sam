import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { BadRequestException } from '../../lib/api_gateway_utils/BadRequestException';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/api_gateway_utils/ApiGatewayResponseHelpers';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';

/**
 * A Lambda function that sets an album's thumbnail to the specified image
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

        let imagePath;
        if (!!event?.body) {
            const body = JSON.parse(event?.body);
            imagePath = body.imagePath;
        }

        await setAlbumThumbnail(tableName, albumPath, imagePath);
        return respondSuccessMessage(`Album [${albumPath}] thumbnail set to [${imagePath}]`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
