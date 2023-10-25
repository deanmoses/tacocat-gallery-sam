import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { handleHttpExceptions, respondSuccessMessage } from '../../lib/api_gateway_utils/ApiGatewayResponseHelpers';
import { BadRequestException } from '../../lib/api_gateway_utils/BadRequestException';
import { updateImage } from '../../lib/gallery/updateImage/updateImage';

/**
 * A Lambda that updates an image's attributes (like title and description) in DynamoDB
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

        const imagePath = event?.pathParameters?.imagePath;
        if (!imagePath) {
            throw new BadRequestException('No image path specified');
        }

        if (!event?.body) {
            throw new BadRequestException('HTTP body cannot be empty');
        }
        const attributesToUpdate = JSON.parse(event.body);

        await updateImage(tableName, imagePath, attributesToUpdate);
        return respondSuccessMessage(`Updated image [${imagePath}]`);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
