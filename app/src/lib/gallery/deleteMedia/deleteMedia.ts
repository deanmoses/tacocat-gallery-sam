import { ConditionalCheckFailedException, ExecuteStatementCommand } from '@aws-sdk/client-dynamodb';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import {
    getParentAndNameFromPath,
    getParentFromPath,
    isValidMediaPath,
} from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { deleteOriginalAndDerivativesForMediaItem } from '../../s3_utils/s3delete';
import { ddbDocClient } from '../../dynamo_utils/ddbClient';

/**
 * Delete specified media (image or video) from both DynamoDB and S3.
 *
 * @param mediaPath Path of media to delete, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
export async function deleteMedia(mediaPath: string) {
    console.info({ event: 'media_delete_started', mediaPath });

    if (!isValidMediaPath(mediaPath)) {
        throw new BadRequestException(`Malformed media path: [${mediaPath}]`);
    }

    await deleteMediaFromDynamoDB(mediaPath);
    await removeMediaAsThumbnailFromParentAlbums(mediaPath);
    await deleteOriginalAndDerivativesForMediaItem(mediaPath);
    console.info({ event: 'media_deleted', mediaPath });
}

/**
 * Delete specified media from DynamoDB.
 *
 * @param mediaPath Path of media, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
async function deleteMediaFromDynamoDB(mediaPath: string) {
    console.info({ event: 'media_dynamo_delete_started', mediaPath });

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
    await ddbDocClient.send(ddbCommand);
}

/**
 * If media is used as the thumbnail of its parent or grandparent album, remove it.
 *
 * @param mediaPath Path of media, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
async function removeMediaAsThumbnailFromParentAlbums(mediaPath: string) {
    console.info({ event: 'album_thumbnail_removal_started', mediaPath });

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
            ' SET updatedOn=?' +
            ' WHERE parentPath=? AND itemName=? AND thumbnail.path=?',
        Parameters: [
            { S: new Date().toISOString() },
            { S: albumPathParts.parent },
            { S: albumPathParts.name ?? '' },
            { S: mediaPath },
        ],
    });
    try {
        await ddbDocClient.send(ddbCommand);
        console.info({ event: 'album_thumbnail_removed', albumPath, mediaPath });
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            console.info({
                event: 'album_thumbnail_unchanged',
                albumPath,
                mediaPath,
                reason: 'media_was_not_thumbnail',
            });
        } else {
            throw e;
        }
    }
}
