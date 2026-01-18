import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
    S3Client,
    DeleteObjectCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
    HeadObjectCommand,
    NotFound,
} from '@aws-sdk/client-s3';
import {
    MediaConvertClient,
    GetJobCommand,
    DescribeEndpointsCommand,
    OutputGroupDetail,
    VideoDetail,
} from '@aws-sdk/client-mediaconvert';
import { getParentFromPath, getNameFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { isValidUuid } from '../../lib/uuid_utils/uuidUtils';
import {
    getDynamoDbTableName,
    getOriginalImagesBucketName,
    getDerivedImagesBucketName,
} from '../../lib/lambda_utils/Env';
import { recordMediaProcessingError } from '../../lib/dynamo_utils/recordError';
import { setImageAsParentAlbumThumbnailIfNoneExists } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { createAlbumNoThrow } from '../../lib/gallery/createAlbum/createAlbum';

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});

/**
 * Cached MediaConvert endpoint URL.
 * Module-level variables persist across Lambda warm invocations (same container reused),
 * so we only call DescribeEndpoints once per cold start instead of every invocation.
 */
let mediaConvertEndpoint: string | undefined;

async function getMediaConvertEndpoint(): Promise<string> {
    if (mediaConvertEndpoint) {
        return mediaConvertEndpoint;
    }

    const client = new MediaConvertClient({});
    const response = await client.send(new DescribeEndpointsCommand({}));
    mediaConvertEndpoint = response.Endpoints?.[0]?.Url;

    if (!mediaConvertEndpoint) {
        throw new Error('Video Transcoding: could not retrieve MediaConvert endpoint');
    }

    return mediaConvertEndpoint;
}

export interface MediaConvertJobStateChangeEvent {
    version: string;
    id: string;
    'detail-type': string;
    source: string;
    account: string;
    time: string;
    region: string;
    detail: {
        status: 'COMPLETE' | 'ERROR' | 'CANCELED';
        jobId: string;
        userMetadata?: {
            path?: string;
            versionId?: string;
            id?: string;
        };
        errorCode?: number;
        errorMessage?: string;
        outputGroupDetails?: OutputGroupDetail[];
    };
}

/**
 * Handle MediaConvert job completion event.
 * On success: write DynamoDB record with video metadata.
 * On failure: write to error table, delete original file, clean up partial outputs.
 */
export async function handleVideoTranscodingComplete(event: MediaConvertJobStateChangeEvent): Promise<void> {
    const { status, jobId, userMetadata, errorMessage } = event.detail;
    const videoPath = userMetadata?.path;
    const versionId = userMetadata?.versionId;
    const videoId = userMetadata?.id;

    console.info(JSON.stringify({ event: 'transcoding_event_received', jobId, status, videoPath, videoId }));

    if (!videoPath || !versionId || !videoId) {
        console.error(JSON.stringify({ event: 'transcoding_missing_metadata', jobId, videoPath, versionId, videoId }));
        return;
    }

    if (!isValidUuid(videoId)) {
        console.error(JSON.stringify({ event: 'transcoding_invalid_uuid', jobId, videoId }));
        throw new Error(`Invalid UUID format: ${videoId}`);
    }

    if (status === 'COMPLETE') {
        await handleSuccess(jobId, videoPath, versionId, videoId);
    } else {
        // ERROR or CANCELED
        const error = errorMessage || `MediaConvert job ${status.toLowerCase()}`;
        await handleFailure(videoPath, videoId, error);
    }
}

async function handleSuccess(jobId: string, videoPath: string, versionId: string, videoId: string): Promise<void> {
    console.info(JSON.stringify({ event: 'transcoding_success_processing', jobId, videoPath, videoId }));

    // Rename MediaConvert outputs from original filename to UUID
    // MediaConvert outputs: video/<filename>_transcoded.mp4 and video/<filename>_poster.0000000.jpg
    // We rename to: video/<UUID>.mp4 and video/<UUID>.jpg
    await renameMediaConvertOutputs(videoPath, videoId);

    // Get job details to extract duration and dimensions
    const { duration, dimensions } = await getJobMetadata(jobId);

    // Ensure parent albums exist (in case of manual upload via S3 Console)
    const albumPath = getParentFromPath(videoPath);
    const albumWasCreated = await createAlbumNoThrow(albumPath);
    if (albumWasCreated) {
        const grandparentAlbumPath = getParentFromPath(albumPath);
        await createAlbumNoThrow(grandparentAlbumPath);
    }

    // Write/update video record in DynamoDB
    // Uses UpdateCommand to preserve user-editable fields (title, description, tags, thumbnail)
    // on re-upload while updating system fields (versionId, dimensions, duration)
    await docClient.send(
        new UpdateCommand({
            TableName: getDynamoDbTableName(),
            Key: {
                parentPath: getParentFromPath(videoPath),
                itemName: getNameFromPath(videoPath),
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
                ':updatedOn': new Date().toISOString(),
            },
        }),
    );

    console.info(JSON.stringify({ event: 'transcoding_dynamo_written', videoPath, videoId, duration, dimensions }));

    // Set as album thumbnail if none exists
    await setImageAsParentAlbumThumbnailIfNoneExists(videoPath);

    console.info(JSON.stringify({ event: 'transcoding_complete', videoPath, videoId }));
}

async function handleFailure(videoPath: string, videoId: string, errorMessage: string): Promise<void> {
    console.error(JSON.stringify({ event: 'transcoding_failed', videoPath, videoId, error: errorMessage }));

    await recordMediaProcessingError(videoPath, errorMessage);

    // Delete original file from S3
    const originalBucket = getOriginalImagesBucketName();
    const key = videoPath.substring(1); // Remove leading slash
    try {
        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: originalBucket,
                Key: key,
            }),
        );
        console.info(JSON.stringify({ event: 'transcoding_original_deleted', key }));
    } catch (error) {
        console.error(JSON.stringify({ event: 'transcoding_original_delete_failed', key, error: String(error) }));
    }

    // Delete partial outputs from derived bucket (uses original filename pattern)
    await deletePartialOutputs(videoPath);
}

async function getJobMetadata(
    jobId: string,
): Promise<{ duration: number; dimensions: { width: number; height: number } }> {
    const endpoint = await getMediaConvertEndpoint();
    const mediaConvertClient = new MediaConvertClient({ endpoint });

    const response = await mediaConvertClient.send(new GetJobCommand({ Id: jobId }));
    const job = response.Job;

    // Extract duration and dimensions from job output details
    let duration = 0;
    let width = 0;
    let height = 0;

    // Look for video details in output group details
    const outputGroupDetails = job?.OutputGroupDetails;
    if (outputGroupDetails) {
        for (const group of outputGroupDetails) {
            const outputDetails = group.OutputDetails;
            if (outputDetails) {
                for (const output of outputDetails) {
                    const videoDetails = output.VideoDetails as VideoDetail | undefined;
                    if (videoDetails) {
                        if (videoDetails.WidthInPx) width = videoDetails.WidthInPx;
                        if (videoDetails.HeightInPx) height = videoDetails.HeightInPx;
                    }
                    // Duration is in milliseconds in the output details
                    if (output.DurationInMs) {
                        duration = Math.round(output.DurationInMs / 1000);
                    }
                }
            }
        }
    }

    // Fallback to job settings if not found in output details
    if (duration === 0 && job?.Timing?.FinishTime && job?.Timing?.StartTime) {
        // This is job processing time, not video duration - use 0 as fallback
        console.warn(JSON.stringify({ event: 'transcoding_duration_extraction_failed', jobId }));
    }

    return {
        duration,
        dimensions: { width, height },
    };
}

/**
 * Check if an S3 object exists.
 * Used for idempotent rename operations on Lambda retries.
 */
async function objectExists(bucket: string, key: string): Promise<boolean> {
    try {
        await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    } catch (err) {
        if (err instanceof NotFound) return false;
        throw err;
    }
}

/**
 * Rename MediaConvert outputs from original filename to UUID-based names.
 * MediaConvert outputs: video/<filename>_transcoded.mp4 and video/<filename>_poster.0000000.jpg
 * We rename to: video/<UUID>.mp4 and video/<UUID>.jpg
 *
 * This function is idempotent: if the destination already exists (from a previous Lambda
 * invocation), it skips the copy and just cleans up any remaining source files.
 */
async function renameMediaConvertOutputs(videoPath: string, videoId: string): Promise<void> {
    const derivedBucket = getDerivedImagesBucketName();

    // Extract original filename without extension from path
    // e.g., /2026/01-14/monkey_village_67.mov -> monkey_village_67
    const filename = getNameFromPath(videoPath);
    if (!filename) {
        throw new Error(`Could not extract filename from path: ${videoPath}`);
    }
    const filenameWithoutExt = filename.replace(/\.[^.]+$/, '');

    // Rename transcoded video: video/<filename>_transcoded.mp4 -> video/<UUID>.mp4
    const videoSourceKey = `video/${filenameWithoutExt}_transcoded.mp4`;
    const videoDestKey = `video/${videoId}.mp4`;

    // Rename poster: video/<filename>_poster.0000000.jpg -> video/<UUID>.jpg
    const posterSourceKey = `video/${filenameWithoutExt}_poster.0000000.jpg`;
    const posterDestKey = `video/${videoId}.jpg`;

    try {
        // Rename video file (idempotent: skip copy if destination exists)
        if (await objectExists(derivedBucket, videoDestKey)) {
            console.info(JSON.stringify({ event: 'transcoding_video_already_renamed', destKey: videoDestKey }));
        } else {
            await s3Client.send(
                new CopyObjectCommand({
                    Bucket: derivedBucket,
                    CopySource: `${derivedBucket}/${videoSourceKey}`,
                    Key: videoDestKey,
                }),
            );
            console.info(
                JSON.stringify({
                    event: 'transcoding_video_renamed',
                    sourceKey: videoSourceKey,
                    destKey: videoDestKey,
                }),
            );
        }
        // Always try to delete source (idempotent: DeleteObject succeeds even if key doesn't exist)
        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: derivedBucket,
                Key: videoSourceKey,
            }),
        );

        // Rename poster file (idempotent: skip copy if destination exists)
        if (await objectExists(derivedBucket, posterDestKey)) {
            console.info(JSON.stringify({ event: 'transcoding_poster_already_renamed', destKey: posterDestKey }));
        } else {
            await s3Client.send(
                new CopyObjectCommand({
                    Bucket: derivedBucket,
                    CopySource: `${derivedBucket}/${posterSourceKey}`,
                    Key: posterDestKey,
                }),
            );
            console.info(
                JSON.stringify({
                    event: 'transcoding_poster_renamed',
                    sourceKey: posterSourceKey,
                    destKey: posterDestKey,
                }),
            );
        }
        // Always try to delete source (idempotent: DeleteObject succeeds even if key doesn't exist)
        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: derivedBucket,
                Key: posterSourceKey,
            }),
        );
    } catch (error) {
        console.error(JSON.stringify({ event: 'transcoding_rename_failed', videoPath, videoId, error: String(error) }));
        throw error; // Re-throw to fail the Lambda and trigger retry
    }
}

async function deletePartialOutputs(videoPath: string): Promise<void> {
    const derivedBucket = getDerivedImagesBucketName();

    // Extract original filename without extension from path
    const filename = getNameFromPath(videoPath);
    if (!filename) {
        console.warn(JSON.stringify({ event: 'transcoding_delete_partial_no_filename', videoPath }));
        return;
    }
    const filenameWithoutExt = filename.replace(/\.[^.]+$/, '');

    // MediaConvert outputs: video/<filename>_transcoded.mp4, video/<filename>_poster.0000000.jpg
    // Prefix matches all files starting with video/<filename>_
    const prefix = `video/${filenameWithoutExt}_`;

    try {
        // List all objects with the filename prefix
        const listResponse = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: derivedBucket,
                Prefix: prefix,
            }),
        );

        const objects = listResponse.Contents || [];
        if (objects.length === 0) {
            console.info(JSON.stringify({ event: 'transcoding_no_partial_outputs', prefix }));
            return;
        }

        // Delete each object
        const deletedKeys: string[] = [];
        for (const obj of objects) {
            if (obj.Key) {
                await s3Client.send(
                    new DeleteObjectCommand({
                        Bucket: derivedBucket,
                        Key: obj.Key,
                    }),
                );
                deletedKeys.push(obj.Key);
            }
        }

        console.info(
            JSON.stringify({
                event: 'transcoding_partial_outputs_deleted',
                prefix,
                count: deletedKeys.length,
                deletedKeys,
            }),
        );
    } catch (error) {
        console.error(
            JSON.stringify({ event: 'transcoding_partial_outputs_delete_failed', prefix, error: String(error) }),
        );
    }
}
