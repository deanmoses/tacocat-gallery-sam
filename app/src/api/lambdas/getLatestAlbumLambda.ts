import { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { getLatestAlbum } from '../../lib/gallery/getLatestAlbum/getLatestAlbum';

/**
 * A Lambda function that retrieves the latest album in the gallery from DynamoDB.
 *
 * Just retrieves enough information to display a thumbnail: does not retrieve any
 * child photos or child albums.
 */
export const handler: APIGatewayProxyHandler = async (): Promise<APIGatewayProxyResult> => {
    try {
        const tableName = process.env.GALLERY_ITEM_DDB_TABLE;
        if (!tableName) throw 'No GALLERY_ITEM_DDB_TABLE defined';

        const album = await getLatestAlbum(tableName);
        if (!album) {
            return {
                isBase64Encoded: false,
                statusCode: 200,
                body: JSON.stringify({}),
            };
        } else {
            return {
                isBase64Encoded: false,
                statusCode: 200,
                body: JSON.stringify(album),
            };
        }
    } catch (e) {
        return {
            isBase64Encoded: false,
            statusCode: 500,
            body: JSON.stringify({ success: false, errorMessage: e }),
        };
    }
};
