import { BadRequestException } from '../../lambda_utils/BadRequestException';
import {
    getParentAndNameFromPath,
    isValidAlbumPath,
    isValidMediaPath,
} from '../../gallery_path_utils/galleryPathUtils';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { itemExists } from '../itemExists/itemExists';
import { ddbDocClient } from '../../dynamo_utils/ddbClient';

/**
 * Set image as its parent album's thumbnail, if the album does not already
 * have a thumbnail.
 *
 * @param mediaPath Path of image like /2001/12-31/image.jpg
 * @returns True if album thumbnail was set; false if album already had thumb
 */
export async function setImageAsParentAlbumThumbnailIfNoneExists(mediaPath: string): Promise<boolean> {
    const mediaPathParts = getParentAndNameFromPath(mediaPath);
    const albumPath = mediaPathParts.parent;
    return setAlbumThumbnail(albumPath, mediaPath, false /* don't replace any existing thumb*/);
}

/**
 * Set specified album's thumbnail to the specified image.
 *
 * @param albumPath Path of album like /2001/12-31/
 * @param mediaPath Path of image like /2001/12-31/image.jpg
 * @param replaceExistingThumb true: replace existing thumbnail, if one exists (the default behavior)
 * @returns True if album thumbnail was set; false if album already had thumb
 */
export async function setAlbumThumbnail(
    albumPath: string,
    mediaPath: string,
    replaceExistingThumb = true,
): Promise<boolean> {
    console.info({ event: 'album_thumbnail_set_started', albumPath, mediaPath });
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Error setting album thumbnail. Invalid album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Error setting album thumbnail. Cannot update root album');
    }

    if (!isValidMediaPath(mediaPath)) {
        throw new BadRequestException(`Error setting album thumbnail. Invalid media path: [${mediaPath}]`);
    }

    // TODO: have an itemsExist() method that takes an array of paths

    if (!(await itemExists(albumPath))) {
        throw new BadRequestException(`Error setting album thumbnail. Album not found: [${albumPath}]`);
    }

    if (!(await itemExists(mediaPath))) {
        throw new BadRequestException(`Error setting album thumbnail. Media not found: [${mediaPath}]`);
    }

    const thumbWasReplaced = await setThumb(albumPath, mediaPath, replaceExistingThumb);
    // The case where the thumb was not set is already logged by setThumb()
    if (thumbWasReplaced) {
        console.info({ event: 'album_thumbnail_set', albumPath, mediaPath });
    }
    return thumbWasReplaced;
}

/**
 * Set the album's thumbnail image.
 *
 * @param albumPath Path of the album like /2001/12-31/
 * @param mediaPath Path of the media like /2001/12-31/image.jpg
 * @param replaceExistingThumb true: replace existing thumbnail, if one exists
 * @param imageUpdatedOn ISO 8601 timestamp of when image was last updated
 * @returns True if album thumbnail was set; false if album already had thumb
 */
async function setThumb(albumPath: string, mediaPath: string, replaceExistingThumb: boolean): Promise<boolean> {
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
            ':thumbnail': { path: mediaPath },
        },
        ConditionExpression: replaceExistingThumb
            ? 'attribute_exists (itemName)'
            : '(attribute_exists (itemName) AND attribute_not_exists (thumbnail))',
    });

    try {
        await ddbDocClient.send(ddbCommand);
        return true;
    } catch (e) {
        // ConditionalCheckFailed means album already has a thumb.
        // That's not an error. Everything else is an error.
        //
        // This relies on the caller checking for the already having checked
        // for the existence of the album, which another method in this
        // file did do.
        if (e instanceof ConditionalCheckFailedException) {
            console.info({
                event: 'album_thumbnail_unchanged',
                albumPath,
                mediaPath,
                reason: 'album_already_has_thumbnail',
            });
        } else {
            throw e;
        }
    }
    return false;
}
