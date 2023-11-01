import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
    ConditionalCheckFailedException,
    DynamoDBClient,
    TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';

/**
 * Set the album's thumbnail image
 *
 * @param albumPath Path of the album like /2001/12-31/
 * @param imagePath Path of the image like /2001/12-31/image.jpg
 * @param imageUpdatedOn ISO 8601 timestamp of when image was last updated
 * @param replaceExistingThumb true (default): replace existing thumbnail
 *
 * @returns true if the album's thumb was updated; false if the album already had a thumb
 */
export async function setImageAsAlbumThumb(
    albumPath: string,
    imagePath: string,
    imageUpdatedOn: string,
    replaceExistingThumb = true,
): Promise<boolean> {
    const albumPathParts = getParentAndNameFromPath(albumPath);
    const imagePathParts = getParentAndNameFromPath(imagePath);

    // Build a transaction command to:
    // 1) set the image as the thumbnail on the album
    // 2) records it on the image
    const ddbCommand = new TransactWriteCommand({
        TransactItems: [
            // Set image as the thumbnail on the album
            {
                Update: {
                    TableName: getDynamoDbTableName(),
                    Key: {
                        parentPath: albumPathParts.parent,
                        itemName: albumPathParts.name,
                    },
                    UpdateExpression: 'set updatedOn = :updatedOn and thumbnail = :thumbnail',
                    ExpressionAttributeValues: {
                        ':updatedOn': new Date().toISOString(),
                        ':thumbnail': { path: imagePath, fileUpdatedOn: imageUpdatedOn },
                    },
                    // If the albums already has a thumbnail, a conditional
                    // check will fail and the entire transaction fails
                    ConditionExpression: replaceExistingThumb
                        ? 'attribute_exists (itemName)'
                        : '(attribute_exists (itemName) and attribute_not_exists (thumbnail))',
                },
            },
            // Set album on the image
            // This lets the image know that it's the album's thumbnail
            {
                Update: {
                    TableName: getDynamoDbTableName(),
                    Key: {
                        parentPath: imagePathParts.parent,
                        itemName: imagePathParts.name,
                    },
                    UpdateExpression: 'set updatedOn = :updatedOn and thumbForAlbums = :thumbForAlbums',
                    ExpressionAttributeValues: {
                        ':updatedOn': new Date().toISOString(),
                        ':thumbForAlbums': albumPath,
                    },
                    ConditionExpression: 'attribute_exists (itemName)',
                },
            },
        ],
    });

    // Do the transaction
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    try {
        await docClient.send(ddbCommand);
        return true;
    } catch (e) {
        // ConditionalCheckFailed means the album already has a thumb.
        // That's not an error. Everything else is an error.
        if (e instanceof TransactionCanceledException || e instanceof ConditionalCheckFailedException) {
            console.info(
                `Not setting album [${albumPath}]'s thumb to [${imagePath}] because album already has a thumb.  Error: ${e.message}`,
            );
        } else {
            throw e;
        }
        // const conditionalCheckFailed =
        //     err.code === 'TransactionCanceledException' && err.message.indexOf('ConditionalCheckFailed') >= 0;
        // if (!conditionalCheckFailed) {
        //     throw err;
        // }
    }
    return false;
}
