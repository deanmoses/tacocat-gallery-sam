import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { AlbumThumbnail } from '../galleryTypes';

/**
 * Retrieve the latest album or image in the specified parent album from DynamoDB.
 *
 * Just retrieves enough information to display a thumbnail: does not retrieve any
 * child photos or child albums.
 *
 * @param {*} tableName Name of the table in DynamoDB containing gallery items
 * @param {*} path Path of the parent album, like /2001/12-31/
 */
export async function getLatestItemInAlbum(tableName: string, path: string): Promise<AlbumThumbnail | undefined> {
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    // find the most recent album within the current year
    const ddbCommand = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'parentPath = :parentPath',
        ExpressionAttributeValues: {
            ':parentPath': path,
        },
        ProjectionExpression: 'itemName,parentPath,itemType,updatedOn,title,description',
        Limit: 1, // # of results to return
        ScanIndexForward: false, // sort results in descending order, i.e., newest first
    });

    const result = await docClient.send(ddbCommand);

    if (!!result.Items && result.Items?.length > 0) {
        return result.Items[0];
    } else {
        return undefined;
    }
}
