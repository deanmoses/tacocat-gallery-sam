import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getAlbumAndChildren } from './getAlbumAndChildren';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

/**
 * A Lambda function that gets an album and its child images and child albums from DynamoDB
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tableName = process.env.GALLERY_ITEM_DDB_TABLE;
    if (!tableName) throw 'No GALLERY_ITEM_DDB_TABLE defined';

    if (!event?.path) throw 'No event.path.  This lambda probably is not being called from the API Gateway';

    // event.path is passed in from the API Gateway and represents the full
    // path of the HTTP request, which starts with "/albums/..."
    const albumPath = event.path.replace('/album', '');
    const album = await getAlbumAndChildren(docClient, tableName, albumPath);
    if (!album) {
        return {
            isBase64Encoded: false,
            statusCode: 404,
            body: JSON.stringify({ errorMessage: 'Album Not Found' }),
        };
    } else {
        return {
            isBase64Encoded: false,
            statusCode: 200,
            body: JSON.stringify(album),
        };
    }
};
