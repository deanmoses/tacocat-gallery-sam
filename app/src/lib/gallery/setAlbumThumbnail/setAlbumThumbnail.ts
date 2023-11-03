import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { isValidAlbumPath, isValidImagePath } from '../../gallery_path_utils/pathValidator';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient, ConditionalCheckFailedException, ResourceNotFoundException } from '@aws-sdk/client-dynamodb';
import { itemExists } from '../itemExists/itemExists';

/**
 * Set image as its parent album's thumbnail, if the album does not already
 * have a thumbnail.
 *
 * @param imagePath Path of image like /2001/12-31/image.jpg
 */
export async function setImageAsParentAlbumThumbnailIfNoneExists(imagePath: string): Promise<boolean> {
    const imagePathParts = getParentAndNameFromPath(imagePath);
    const albumPath = imagePathParts.parent;
    return setAlbumThumbnail(albumPath, imagePath, false /* don't replace any existing thumb*/);
}

/**
 * Set specified album's thumbnail to the specified image.
 *
 * @param albumPath Path of album like /2001/12-31/
 * @param imagePath Path of image like /2001/12-31/image.jpg
 * @param replaceExistingThumb true: replace existing thumbnail, if one exists (the default behavior)
 */
export async function setAlbumThumbnail(
    albumPath: string,
    imagePath: string,
    replaceExistingThumb = true,
): Promise<boolean> {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Error setting album thumbnail. Invalid album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Error setting album thumbnail. Cannot update root album');
    }

    if (!isValidImagePath(imagePath)) {
        throw new BadRequestException(`Error setting album thumbnail. Invalid image path: [${imagePath}]`);
    }

    if (!(await itemExists(albumPath))) {
        throw new BadRequestException(`Error setting album thumbnail. Album not found: [${albumPath}]`);
    }

    const image = await getImage(imagePath);
    const thumbnailUpdatedOn = image?.thumbnail ? image.thumbnail?.updatedOn : image?.updatedOn;
    return await setThumb(albumPath, imagePath, replaceExistingThumb, thumbnailUpdatedOn);
}

/**
 * Return the specified image from DynamoDB.
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
 * Set the album's thumbnail image.
 *
 * @param albumPath Path of the album like /2001/12-31/
 * @param imagePath Path of the image like /2001/12-31/image.jpg
 * @param replaceExistingThumb true: replace existing thumbnail, if one exists
 * @param imageUpdatedOn ISO 8601 timestamp of when image was last updated
 */
async function setThumb(
    albumPath: string,
    imagePath: string,
    replaceExistingThumb: boolean,
    imageUpdatedOn: string,
): Promise<boolean> {
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
        ConditionExpression: replaceExistingThumb
            ? 'attribute_exists (itemName)'
            : '(attribute_exists (itemName) AND attribute_not_exists (thumbnail))',
    });

    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    try {
        await docClient.send(ddbCommand);
        return true;
    } catch (e) {
        // ConditionalCheckFailed means album already has a thumb.
        // That's not an error. Everything else is an error.
        //
        // This relies on the caller checking for the already having checked
        // for the existence of the album, which another method in this
        // file did do.
        if (e instanceof ConditionalCheckFailedException) {
            console.trace(
                `Set Album Thumb: not setting album [${albumPath}]'s thumb to [${imagePath}] because album already has a thumb`,
            );
        } else {
            throw e;
        }
    }
    return false;
}
