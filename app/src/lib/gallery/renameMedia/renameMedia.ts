import { DynamoDBClient, ExecuteStatementCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
    getNameFromPath,
    getParentAndNameFromPath,
    getParentFromPath,
    isValidAlbumPath,
    isValidMediaNameStrict,
    isValidMediaPath,
} from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { itemExists } from '../itemExists/itemExists';
import { copyOriginal } from '../../s3_utils/s3copy';
import { deleteOriginalAndDerivatives } from '../../s3_utils/s3delete';
import { getFullItemFromDynamoDB } from '../../dynamo_utils/ddbGet';
import { MediaItem } from '../galleryTypes';

/**
 * Rename a media item (image or video) in both DynamoDB and S3.
 *
 * Only supports renaming within the same album.
 * I COULD implement this as a move and allow moving to other albums,
 * but v1 of the UI won't support that.  I can build that support when
 * I need it in the UI.
 *
 * For videos: The UUID is preserved in the DynamoDB record, so the transcoded
 * video and poster stored by <UUID> remain valid. Only the original file in the
 * Originals bucket and derived thumbnails are deleted/recreated.
 *
 * @param oldMediaPath Path of existing media like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 * @param newName New name of media like newName.jpg or newName.mp4
 * @returns Path of new media like /2001/12-31/newName.jpg
 */
export async function renameMedia(oldMediaPath: string, newName: string): Promise<string> {
    console.info(`Rename Media: renaming [${oldMediaPath}] to [${newName}]...`);
    assertIsValidMediaPath(oldMediaPath);
    validateNewMediaName(oldMediaPath, newName);
    const newMediaPath = getParentFromPath(oldMediaPath) + newName;
    await Promise.all([assertMediaExists(oldMediaPath), assertMediaDoesNotExist(newMediaPath)]);
    const newVersionId = await copyOriginal(oldMediaPath, newMediaPath);
    await renameMediaInDynamoDB(oldMediaPath, newName, newVersionId);
    await deleteOriginalAndDerivatives(oldMediaPath); // Doesn't take videoUuid: for videos, we keep <UUID> files since UUID is preserved
    console.info(`Rename Media: renamed media from [${oldMediaPath}] to [${newMediaPath}]`);
    return newMediaPath;
}

function assertIsValidMediaPath(mediaPath: string): void {
    if (!isValidMediaPath(mediaPath)) {
        throw new BadRequestException(`Invalid media path: [${mediaPath}]`);
    }
}

async function assertMediaExists(mediaPath: string): Promise<void> {
    if (!(await itemExists(mediaPath))) {
        throw new BadRequestException(`Media not found: [${mediaPath}]`);
    }
}

async function assertMediaDoesNotExist(mediaPath: string): Promise<void> {
    if (await itemExists(mediaPath)) {
        throw new BadRequestException(`A media item already exists at [${mediaPath}]`);
    }
}

/**
 * Verify that the new media name is valid.
 * Including that it's the same extension as the old media.
 *
 * @param existingMediaPath Path of existing media like /2001/12-31/image.jpg
 * @param newName New name of media like newName.jpg
 */
function validateNewMediaName(existingMediaPath: string, newName: string) {
    if (!isValidMediaNameStrict(newName)) {
        throw new BadRequestException(`New media name is invalid: [${newName}]`);
    }
    if (newName === getNameFromPath(existingMediaPath)) {
        throw new BadRequestException(`New media name [${newName}] cannot be same as old one [${existingMediaPath}]`);
    }
    const oldExtension = existingMediaPath.split('.').pop()?.toLowerCase();
    const newExtension = newName.split('.').pop()?.toLowerCase();
    if (newExtension !== oldExtension) {
        throw new BadRequestException(`File extension of [${newName}] does not match [${existingMediaPath}]`);
    }
}

/**
 * Rename the media in DynamoDB.
 * Renames any usages of the media as an album thumbnail as well.
 * Does not touch S3.
 *
 * @param oldMediaPath Old media path like /2001/12-31/image.jpg
 * @param newMediaName New media name like new_image_name.jpg
 * @param newVersionId Version ID of new media
 */
async function renameMediaInDynamoDB(oldMediaPath: string, newMediaName: string, newVersionId: string) {
    const albumPath = getParentFromPath(oldMediaPath);
    const newMediaPath = albumPath + newMediaName;
    const grandparentAlbumPath = getParentFromPath(albumPath);
    // TODO: these should all be done in a single transaction.
    // However, since updating the album thumbnail entries rely on a
    // a condition failing, the transaction would fail.  BZZZT.
    await Promise.all([
        moveMediaInDynamoDB(oldMediaPath, newMediaName, newVersionId),
        renameAlbumThumb(albumPath, oldMediaPath, newMediaPath),
        renameAlbumThumb(grandparentAlbumPath, oldMediaPath, newMediaPath),
    ]);
}

/**
 * Rename specified entry in DynamoDB.
 * Does not update any usages of the media as an album thumbnail (unfortunately)
 * Does not touch S3.
 *
 * @param oldMediaPath Path of existing media like /2001/12-31/image.jpg
 * @param newMediaName New name of media like newName.jpg
 * @param newVersionId Version ID of new media
 */
async function moveMediaInDynamoDB(oldMediaPath: string, newMediaName: string, newVersionId: string) {
    console.info(`Rename Media: renaming media entry in DynamoDB from [${oldMediaPath}] to [${newMediaName}]...`);
    const oldPathParts = getParentAndNameFromPath(oldMediaPath);
    const media = await getFullItemFromDynamoDB<MediaItem>(oldMediaPath);
    if (!media) throw new Error(`Old media [${oldMediaPath}] not found in DynamoDB`);
    media.itemName = newMediaName;
    media.updatedOn = new Date().toISOString();
    media.versionId = newVersionId;
    const ddbCommand = new TransactWriteCommand({
        TransactItems: [
            // Create new entry
            {
                Put: {
                    TableName: getDynamoDbTableName(),
                    Item: media,
                },
            },
            // Delete old entry
            {
                Delete: {
                    TableName: getDynamoDbTableName(),
                    Key: {
                        parentPath: oldPathParts.parent,
                        itemName: oldPathParts.name,
                    },
                },
            },
        ],
    });
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    await docClient.send(ddbCommand);
}

/**
 * If specified album is using the specified media as its thumbnail,
 * update it to the media's new path.
 *
 * @param albumPath Path of album like /2001/12-31/ or /2001/
 * @param oldMediaPath Old path of media like /2001/12-31/image.jpg
 * @param newMediaPath New path of media like /2001/12-31/new_name.jpg
 */
export async function renameAlbumThumb(albumPath: string, oldMediaPath: string, newMediaPath: string): Promise<void> {
    console.info(`Attempting to rename thumb of [${albumPath}] from [${oldMediaPath}] to [${newMediaPath}]...`);
    if (!isValidAlbumPath(albumPath)) throw new Error(`Invalid album path: [${albumPath}]`);
    if (!isValidMediaPath(oldMediaPath)) throw new Error(`Invalid media path: [${oldMediaPath}]`);
    if (!isValidMediaPath(newMediaPath)) throw new Error(`Invalid media path: [${newMediaPath}]`);
    const albumPathParts = getParentAndNameFromPath(albumPath);
    const ddbCommand = new ExecuteStatementCommand({
        Statement:
            `UPDATE "${getDynamoDbTableName()}"` +
            ' SET thumbnail.path=?' +
            ' SET updatedOn=?' +
            ' WHERE parentPath=? AND itemName=? AND thumbnail.path=?',
        Parameters: [
            { S: newMediaPath },
            { S: new Date().toISOString() },
            { S: albumPathParts.parent },
            { S: albumPathParts.name ?? '' },
            { S: oldMediaPath },
        ],
    });

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        await docClient.send(ddbCommand);
        console.info(`Album [${albumPath}]: renamed thumbnail from [${oldMediaPath}] to [${newMediaPath}]`);
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            console.info(`Album [${albumPath}] did not have media [${oldMediaPath}] as its thumbnail`);
        } else {
            throw e;
        }
    }
}
