import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath, isValidVideoPath } from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { Size } from '../galleryTypes';

/**
 * Create or update a video in DynamoDB.
 * Uses UpdateCommand to preserve user-editable fields (title, description, tags, thumbnail)
 * on re-upload while updating system fields (versionId, dimensions, duration).
 *
 * @param videoPath Path of the video, like /2001/12-31/video.mp4
 * @param videoId UUID for locating transcoded video and poster in Derived bucket
 * @param versionId S3 version ID of the original video
 * @param dimensions Video dimensions (width and height)
 * @param duration Video duration in seconds
 */
export async function upsertVideo(
    videoPath: string,
    videoId: string,
    versionId: string,
    dimensions: Size,
    duration: number,
): Promise<void> {
    if (!isValidVideoPath(videoPath)) {
        throw new BadRequestException(`Invalid video path: [${videoPath}]`);
    }
    if (!videoId) {
        throw new BadRequestException(`Missing videoId`);
    }
    if (!versionId) {
        throw new BadRequestException(`Missing versionId`);
    }

    const pathParts = getParentAndNameFromPath(videoPath);
    if (!pathParts.name) throw new Error('Expecting path to have a leaf, got none');

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    const now = new Date().toISOString();
    await docClient.send(
        new UpdateCommand({
            TableName: getDynamoDbTableName(),
            Key: {
                parentPath: pathParts.parent,
                itemName: pathParts.name,
            },
            UpdateExpression:
                'SET itemType = :itemType, mediaType = :mediaType, id = :id, versionId = :versionId, ' +
                'dimensions = :dimensions, #dur = :duration, updatedOn = :updatedOn',
            ExpressionAttributeNames: {
                '#dur': 'duration', // duration is a reserved word
            },
            ExpressionAttributeValues: {
                ':itemType': 'image', // itemType is 'image' for all media (videos and images)
                ':mediaType': 'video',
                ':id': videoId,
                ':versionId': versionId,
                ':dimensions': dimensions,
                ':duration': duration,
                ':updatedOn': now,
            },
        }),
    );
}
