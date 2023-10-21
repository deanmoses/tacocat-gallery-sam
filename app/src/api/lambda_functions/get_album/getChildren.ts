import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Get an album's immediate children: both images and subalbums.
 * Does not get grandchildren.
 *
 * @param {*} docClient AWS DynamoDB DocumentClient
 * @param {*} tableName Name of the table in DynamoDB containing gallery items
 * @param {*} path Path of the album whose children are to be retrieved, like /2001/12-31/
 */
export async function getChildren(docClient: DynamoDBDocumentClient, tableName: string, path: string) {
    const ddbCommand = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'parentPath = :parentPath',
        ExpressionAttributeValues: {
            ':parentPath': path,
        },
        ProjectionExpression: 'itemName,parentPath,published,itemType,updatedOn,dimensions,title,description,thumbnail',
    });

    const results = await docClient.send(ddbCommand);
    return results.Items;
}
