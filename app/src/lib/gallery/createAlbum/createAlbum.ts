import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';

/**
 * Create album in DynamoDB
 *
 * @param albumPath path of the album, like '/2001/12-31/'
 * @param throwIfExists true: throw Error if album already exists (default)
 */
export async function createAlbum(albumPath: string, throwIfExists = true): Promise<void> {
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
        await docClient.send(ddbCommand);
        console.info(`Create Album: created [${albumPath}]`);
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            console.info(`Create Album: already exists [${albumPath}]`);
            if (throwIfExists) {
                throw new BadRequestException(`Album already exists: [${albumPath}]`);
            }
        } else {
            throw e;
        }
    }
}
