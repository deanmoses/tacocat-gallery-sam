import { OutputGroupDetail } from '@aws-sdk/client-mediaconvert';
import { getParentFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { getOriginalImagesBucketName } from '../../lib/lambda_utils/Env';
import { recordMediaProcessingError } from '../../lib/dynamo_utils/recordError';
import { setImageAsParentAlbumThumbnailIfNoneExists } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { createAlbumNoThrow } from '../../lib/gallery/createAlbum/createAlbum';
import { upsertVideo } from '../../lib/gallery/upsertVideo/upsertVideo';
import { getMediaConvertJobMetadata } from '../../lib/mediaconvert_utils/getMediaConvertJobMetadata';
import { revertS3Version } from '../../lib/s3_utils/s3revertVersion';
import { renameMediaConvertOutputs, deletePartialOutputs } from './s3';

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
        };
        errorCode?: number;
        errorMessage?: string;
        outputGroupDetails?: OutputGroupDetail[];
    };
}

/**
 * Handle MediaConvert job completion event.
 * On success: write DynamoDB record with video metadata.
 * On failure: write to error table, revert original file, clean up partial outputs.
 */
export async function handleVideoTranscodingComplete(event: MediaConvertJobStateChangeEvent): Promise<void> {
    const { status, jobId, userMetadata, errorMessage } = event.detail;
    const videoPath = userMetadata?.path;
    const versionId = userMetadata?.versionId;

    console.info(JSON.stringify({ event: 'transcoding_event_received', jobId, status, videoPath }));

    if (!videoPath || !versionId) {
        console.error(JSON.stringify({ event: 'transcoding_missing_metadata', jobId, videoPath, versionId }));
        return;
    }

    if (status === 'COMPLETE') {
        await handleSuccess(jobId, videoPath, versionId);
    } else {
        // ERROR or CANCELED
        const error = errorMessage || `MediaConvert job ${status.toLowerCase()}`;
        await handleFailure(videoPath, versionId, error);
    }
}

/**
 * Handle successful MediaConvert job completion event.
 * Verifies content types, renames outputs, and writes DynamoDB record with video metadata.
 * If content type verification fails, treats as a failure: records error, deletes outputs, reverts original.
 */
async function handleSuccess(jobId: string, videoPath: string, versionId: string): Promise<void> {
    console.info(JSON.stringify({ event: 'transcoding_success_processing', jobId, videoPath }));

    // Verify content types and rename MediaConvert outputs
    // MediaConvert outputs: S3_PATH/<filename>_transcoded.mp4 and S3_PATH/<filename>_poster.0000000.jpg
    // We rename to: S3_PATH/video-transcoded and S3_PATH/video-poster
    const renameResult = await renameMediaConvertOutputs(videoPath, versionId);
    if (!renameResult.success) {
        // Content type verification or rename failed - treat as a failure
        console.error(
            JSON.stringify({ event: 'transcoding_rename_validation_failed', videoPath, error: renameResult.error }),
        );
        await handleFailure(videoPath, versionId, renameResult.error);
        return;
    }

    // Get job details to extract duration and dimensions
    const { duration, dimensions } = await getMediaConvertJobMetadata(jobId);

    // Ensure parent albums exist (in case of manual upload via S3 Console)
    const albumPath = getParentFromPath(videoPath);
    const albumWasCreated = await createAlbumNoThrow(albumPath);
    if (albumWasCreated) {
        const grandparentAlbumPath = getParentFromPath(albumPath);
        await createAlbumNoThrow(grandparentAlbumPath);
    }

    // Write/update video record in DynamoDB
    await upsertVideo(videoPath, versionId, dimensions, duration);

    console.info(JSON.stringify({ event: 'transcoding_dynamo_written', videoPath, duration, dimensions }));

    // Set as album thumbnail if none exists
    await setImageAsParentAlbumThumbnailIfNoneExists(videoPath);

    console.info(JSON.stringify({ event: 'transcoding_complete', videoPath }));
}

/**
 * Handle failed MediaConvert job completion event.
 * Write to error table, revert original file, clean up partial outputs.
 */
async function handleFailure(videoPath: string, versionId: string, errorMessage: string): Promise<void> {
    console.error(JSON.stringify({ event: 'transcoding_failed', videoPath, error: errorMessage }));

    await recordMediaProcessingError(videoPath, errorMessage);

    // Revert original file to previous version (or delete if first version)
    const originalBucket = getOriginalImagesBucketName();
    const key = videoPath.substring(1); // Remove leading slash
    try {
        await revertS3Version(originalBucket, key, versionId);
        console.info(JSON.stringify({ event: 'transcoding_original_reverted', key }));
    } catch (error) {
        console.error(JSON.stringify({ event: 'transcoding_original_revert_failed', key, error: String(error) }));
    }

    // Delete partial outputs from derived bucket
    await deletePartialOutputs(videoPath, versionId);
}
