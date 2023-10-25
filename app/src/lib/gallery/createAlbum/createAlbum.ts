import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { BadRequestException } from '../../api_gateway_utils/BadRequestException';

/**
 * Create album in DynamoDB
 *
 * @param tableName name of the Gallery Item table in DynamoDB
 * @param albumPath path of the album, like '/2001/12-31/'
 */
export async function createAlbum(tableName: string, albumPath: string) {
    if (!tableName) throw 'No gallery item table specified';

    if (!albumPath) {
        throw new BadRequestException('No album path specified');
    }

    if (!isValidAlbumPath(albumPath)) {
        throw `Invalid album path: [${albumPath}]`;
    }

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const pathParts = getParentAndNameFromPath(albumPath);
    const now = new Date().toISOString();

    const ddbCommand = new PutCommand({
        TableName: tableName,
        Item: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
            itemType: 'album',
            createdOn: now,
            updatedOn: now,
        },
        ConditionExpression: 'attribute_not_exists (itemName)',
    });
    const result = await docClient.send(ddbCommand);

    console.info(`DynamoDB result for creating album [${albumPath}]: `, result);

    return result.$metadata;
}
