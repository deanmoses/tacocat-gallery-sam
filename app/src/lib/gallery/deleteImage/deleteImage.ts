import { ConditionalCheckFailedException, DynamoDBClient, ExecuteStatementCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
    getParentAndNameFromPath,
    getParentFromPath,
    isValidMediaPath,
} from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { deleteOriginalAndDerivatives } from '../../s3_utils/s3delete';
import { getFullItemFromDynamoDB } from '../../dynamo_utils/ddbGet';
import { VideoItem } from '../galleryTypes';

/**
 * Delete specified media (image or video) from both DynamoDB and S3.
 *
 * For videos, this also deletes the transcoded video and poster from /video/<UUID>.
 *
 * @param mediaPath Path of media to delete, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
export async function deleteImage(mediaPath: string) {
    console.info(`Delete Media: deleting media [${mediaPath}]...`);

    if (!isValidMediaPath(mediaPath)) {
        throw new BadRequestException(`Malformed media path: [${mediaPath}]`);
    }

    // For videos, we need to get the UUID before deleting from DynamoDB
    const videoUuid = await getVideoUuidIfExists(mediaPath);

    await deleteMediaFromDynamoDB(mediaPath);
    await removeMediaAsThumbnailFromParentAlbums(mediaPath);
    await deleteOriginalAndDerivatives(mediaPath, videoUuid);
    console.info(`Delete Media: deleted media [${mediaPath}]`);
}

/**
 * Get the UUID from a video's DynamoDB record if it exists.
 * Returns undefined for images or if the record doesn't exist.
 *
 * @param mediaPath Path of media, like /2001/12-31/video.mp4
 */
async function getVideoUuidIfExists(mediaPath: string): Promise<string | undefined> {
    try {
        const item = await getFullItemFromDynamoDB<VideoItem>(mediaPath);
        // Videos have an 'id' field with the UUID
        if (item && 'id' in item && item.id) {
            console.info(`Delete Media: found video UUID [${item.id}] for [${mediaPath}]`);
            return item.id;
        }
    } catch (error) {
        // Log but don't throw - deleting the item is more important than cleaning up video assets
        console.warn(JSON.stringify({ event: 'delete_media_uuid_fetch_failed', mediaPath, error: String(error) }));
    }
    return undefined;
}

/**
 * Delete specified media from DynamoDB.
 *
 * @param mediaPath Path of media, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
async function deleteMediaFromDynamoDB(mediaPath: string) {
    console.info(`Delete Media: deleting from DynamoDB [${mediaPath}]...`);

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    // TODO: block delete if the album contains child photos or child albums
    const tableName = getDynamoDbTableName();
    const pathParts = getParentAndNameFromPath(mediaPath);
    const ddbCommand = new DeleteCommand({
        TableName: tableName,
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
    });
    await docClient.send(ddbCommand);
}

/**
 * If media is used as the thumbnail of its parent or grandparent album, remove it.
 *
 * @param mediaPath Path of media, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
async function removeMediaAsThumbnailFromParentAlbums(mediaPath: string) {
    console.info(`Delete Media: removing media as any album thumbnail [${mediaPath}]...`);

    const parentAlbumPath = getParentFromPath(mediaPath);
    await removeMediaAsAlbumThumbnail(mediaPath, parentAlbumPath);

    const grandparentAlbumPath = getParentFromPath(parentAlbumPath);
    await removeMediaAsAlbumThumbnail(mediaPath, grandparentAlbumPath);
}

/**
 * If media is used as the thumbnail of the specified album, remove it.
 *
 * @param mediaPath Path of media, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 * @param albumPath Path of album, like /2001/12-31/
 */
async function removeMediaAsAlbumThumbnail(mediaPath: string, albumPath: string) {
    const albumPathParts = getParentAndNameFromPath(albumPath);
    const ddbCommand = new ExecuteStatementCommand({
        Statement:
            `UPDATE "${getDynamoDbTableName()}"` +
            ' REMOVE thumbnail' +
            ` SET updatedOn='${new Date().toISOString()}'` +
            ` WHERE parentPath='${albumPathParts.parent}' AND itemName='${albumPathParts.name}' AND thumbnail.path='${mediaPath}'`,
    });
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        await docClient.send(ddbCommand);
        console.info(`Delete Media: album [${albumPath}]: removed media [${mediaPath}] as its thumbnail`);
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            console.info(`Delete Media: album [${albumPath}] did not have media [${mediaPath}] as its thumbnail`);
        } else {
            throw e;
        }
    }
}
