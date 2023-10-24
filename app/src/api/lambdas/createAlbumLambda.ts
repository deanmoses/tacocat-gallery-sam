import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';

/**
 * A Lambda function that creates the album in DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tableName = process.env.GALLERY_ITEM_DDB_TABLE;
    if (!tableName) throw 'No GALLERY_ITEM_DDB_TABLE defined';
    if (!event?.path) throw 'No event.path.  This lambda probably is not being called from the API Gateway';
    if (event.httpMethod !== 'PUT') throw 'This can only be called from a HTTP PUT';

    // event.path is passed in from the API Gateway and represents the full
    // path of the HTTP request, which starts with "/album/..."
    const albumPath = event.path.replace('/album', '');

    try {
        const results = await createAlbum(tableName, albumPath);
        if (results?.httpStatusCode !== 200) throw 'Error saving album';

        return {
            isBase64Encoded: false,
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };
    } catch (e) {
        return {
            isBase64Encoded: false,
            statusCode: 500,
            body: JSON.stringify({ success: false, errorMessage: e }),
        };
    }
};
