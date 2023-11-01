import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { isValidAlbumPath, isValidImagePath } from '../../gallery_path_utils/pathValidator';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
    DynamoDBClient,
    ConditionalCheckFailedException,
    TransactionCanceledException,
    ResourceNotFoundException,
} from '@aws-sdk/client-dynamodb';

/**
 * Set specified album's thumbnail to the specified image.
 */
export async function setAlbumThumbnail(albumPath: string, imagePath: string) {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Error setting album thumbnail. Invalid album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Error setting album thumbnail. Cannot update root album');
    }

    if (!isValidImagePath(imagePath)) {
        throw new BadRequestException(`Error setting album thumbnail. Invalid image path: [${imagePath}]`);
    }

    const image = await getImage(imagePath);
    const thumbnailUpdatedOn = image?.thumbnail ? image.thumbnail?.updatedOn : image?.updatedOn;
    await setThumb(albumPath, imagePath, thumbnailUpdatedOn, true /* replaceExistingThumb */);
}

/**
 * Return the specified image from DynamoDB
 *
 * @param imagePath Path of the image to retrieve, like /2001/12-31/image.jpg
 */
async function getImage(imagePath: string) {
    const pathParts = getParentAndNameFromPath(imagePath);
    const ddbCommand = new GetCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
        ProjectionExpression: 'updatedOn,thumbnail',
    });
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    try {
        const result = await docClient.send(ddbCommand);
        if (!result.Item) throw new BadRequestException(`Image not found: [${imagePath}]`);
        return result.Item;
    } catch (e) {
        if (e instanceof ResourceNotFoundException) {
            throw new BadRequestException(`Image not found: [${imagePath}]`);
        }
        throw e;
    }
}

/**
 * Set the album's thumbnail image
 *
 * @param albumPath Path of the album like /2001/12-31/
 * @param imagePath Path of the image like /2001/12-31/image.jpg
 * @param imageUpdatedOn ISO 8601 timestamp of when image was last updated
 * @param replaceExistingThumb true: replace existing thumbnail
 */
async function setThumb(albumPath: string, imagePath: string, imageUpdatedOn: string, replaceExistingThumb = true) {
    const albumPathParts = getParentAndNameFromPath(albumPath);

    // Build the command
    const ddbCommand = new UpdateCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: albumPathParts.parent,
            itemName: albumPathParts.name,
        },
        UpdateExpression: 'SET updatedOn = :updatedOn, thumbnail = :thumbnail',
        ExpressionAttributeValues: {
            ':updatedOn': new Date().toISOString(),
            ':thumbnail': { path: imagePath, fileUpdatedOn: imageUpdatedOn },
        },
        // If the albums already has a thumbnail, a conditional
        // check will fail and the entire transaction fails
        ConditionExpression: replaceExistingThumb
            ? 'attribute_exists (itemName)'
            : '(attribute_exists (itemName) AND attribute_not_exists (thumbnail))',
    });

    // Do the command
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    try {
        await docClient.send(ddbCommand);
    } catch (e) {
        // TODO: this fails silently if the image or album doesn't exist.
        // Instead, it should throw a condition unmet exception, and this
        // should then throw a BadRequestException(`Album not found: [${albumPath}]`);

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
}
