import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { ResponseMetadata } from '@aws-sdk/types';

/**
 * Create album in DynamoDB
 *
 * @param albumPath path of the album, like '/2001/12-31/'
 */
export async function createAlbum(albumPath: string): Promise<ResponseMetadata> {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Invalid album path: [${albumPath}]`);
    }

    //
    // Construct the DynamoDB command
    //
    const pathParts = getParentAndNameFromPath(albumPath);
    const now = new Date().toISOString();
    const ddbCommand = new PutCommand({
        TableName: getDynamoDbTableName(),
        Item: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
            itemType: 'album',
            createdOn: now,
            updatedOn: now,
        },
        ConditionExpression: 'attribute_not_exists (itemName)',
    });

    //
    // Send command to DynamoDB
    //
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        const result = await docClient.send(ddbCommand);
        return result.$metadata;
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            throw new BadRequestException(`Album already exists: [${albumPath}]`);
        }
        throw e;
    }
}
