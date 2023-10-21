import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath } from '../../../lib/gallery_path_utils/getParentAndNameFromPath';

/**
 * Retrieve an album from DynamoDB.  Does not retrieve any child photos or child albums.
 *
 * @param {*} docClient AWS DynamoDB DocumentClient
 * @param {*} tableName Name of the table in DynamoDB containing gallery items
 * @param {*} path Path of the album to retrieve, like /2001/12-31/
 */
export async function getAlbum(docClient: DynamoDBDocumentClient, tableName: string, path: string) {
    const pathParts = getParentAndNameFromPath(path);
    const ddbCommand = new GetCommand({
        TableName: tableName,
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
        ProjectionExpression: 'itemName,parentPath,published,itemType,updatedOn,title,description,thumbnail',
    });
    const result = await docClient.send(ddbCommand);
    return result.Item;
}
