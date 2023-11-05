import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { Album } from '../galleryTypes';

/**
 * Get an album's immediate children: both images and subalbums.
 * Does not get grandchildren.
 *
 * @param path Path of the album whose children are to be retrieved, like /2001/12-31/
 */
export async function getChildren(path: string): Promise<Array<Album> | undefined> {
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const tableName = getDynamoDbTableName();
    const ddbCommand = new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'parentPath = :parentPath',
        ExpressionAttributeValues: {
            ':parentPath': path,
        },
        ProjectionExpression:
            'itemName,parentPath,published,itemType,updatedOn,dimensions,title,description,tags,thumbnail',
    });
    const results = await docClient.send(ddbCommand);
    return results.Items;
}
