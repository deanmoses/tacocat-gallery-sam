import {
    S3Client,
    DeleteObjectCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
    HeadObjectCommand,
    NotFound,
} from '@aws-sdk/client-s3';
import { getNameFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { getDerivedImagesBucketName } from '../../lib/lambda_utils/Env';
import { objectExists } from '../../lib/s3_utils/s3exists';
import {
    getDerivedAssetIdVersionPrefix,
    getTranscodedVideoS3Key,
    getVideoPosterS3Key,
} from '../../lib/s3_utils/s3path';

const s3Client = new S3Client({});

// Content type prefixes to verify MediaConvert set a valid content type.
// We check prefixes (not exact types) to allow for codec variations like video/webm, image/png, etc.
const VIDEO_CONTENT_TYPE_PREFIX = 'video/';
const POSTER_CONTENT_TYPE_PREFIX = 'image/';

/**
 * Get the content type of an S3 object.
 * Returns undefined if the object doesn't exist.
 * Re-throws other errors to allow Lambda retry on transient failures.
 */
async function getContentType(bucket: string, key: string): Promise<string | undefined> {
    try {
        const response = await s3Client.send(
            new HeadObjectCommand({
                Bucket: bucket,
                Key: key,
            }),
        );
        return response.ContentType;
    } catch (error) {
        if (error instanceof NotFound) {
            return undefined;
        }
        throw error;
    }
}

export type RenameResult = { success: true } | { success: false; error: string };

/**
 * Rename MediaConvert outputs from original filename to clean names.
 * MediaConvert outputs: <filename>_transcoded.mp4 and <filename>_poster.0000000.jpg
 * We rename to: 'transcoded' and 'poster'
 *
 * We rename without extensions because it makes them easier for the rest of the
 * system to find without needing to know their file formats.  This enables us to
 * change formats in the future.
 *
 * Before renaming, verifies that the source files have correct content types.
 * If content types are wrong, returns an error instead of renaming.
 *
 * This function is idempotent: if the destination already exists (from a previous Lambda
 * invocation), it skips the copy and just cleans up any remaining source files.
 *
 * @returns RenameResult indicating success or failure with error message
 */
export async function renameMediaConvertOutputs(
    videoPath: string,
    videoId: string,
    versionId: string,
): Promise<RenameResult> {
    const derivedBucket = getDerivedImagesBucketName();

    // Extract original filename without extension from path
    // e.g., /2026/01-14/monkey_village_67.mov -> monkey_village_67
    const filename = getNameFromPath(videoPath);
    if (!filename) {
        return { success: false, error: `Could not extract filename from path: ${videoPath}` };
    }
    const filenameWithoutExt = filename.replace(/\.[^.]+$/, '');

    // Base path for this video version
    const basePath = getDerivedAssetIdVersionPrefix(videoId, versionId);

    // Rename transcoded video: <filename>_transcoded.mp4 -> transcoded
    const videoSourceKey = `${basePath}${filenameWithoutExt}_transcoded.mp4`;
    const videoDestKey = getTranscodedVideoS3Key(videoId, versionId);

    // Rename poster: <filename>_poster.0000000.jpg -> poster
    const posterSourceKey = `${basePath}${filenameWithoutExt}_poster.0000000.jpg`;
    const posterDestKey = getVideoPosterS3Key(videoId, versionId);

    // Check if already renamed (idempotent for Lambda retries)
    const videoAlreadyRenamed = await objectExists(derivedBucket, videoDestKey);
    const posterAlreadyRenamed = await objectExists(derivedBucket, posterDestKey);

    // Verify content types before renaming (skip if already renamed)
    if (!videoAlreadyRenamed) {
        const videoContentType = await getContentType(derivedBucket, videoSourceKey);
        if (!videoContentType) {
            return { success: false, error: `Transcoded video not found at ${videoSourceKey}` };
        }
        if (!videoContentType.startsWith(VIDEO_CONTENT_TYPE_PREFIX)) {
            return {
                success: false,
                error: `Transcoded video has wrong content type: expected ${VIDEO_CONTENT_TYPE_PREFIX}*, got ${videoContentType}`,
            };
        }
    }

    if (!posterAlreadyRenamed) {
        const posterContentType = await getContentType(derivedBucket, posterSourceKey);
        if (!posterContentType) {
            return { success: false, error: `Poster image not found at ${posterSourceKey}` };
        }
        if (!posterContentType.startsWith(POSTER_CONTENT_TYPE_PREFIX)) {
            return {
                success: false,
                error: `Poster image has wrong content type: expected ${POSTER_CONTENT_TYPE_PREFIX}*, got ${posterContentType}`,
            };
        }
    }

    try {
        // Rename video file (idempotent: skip copy if destination exists)
        if (videoAlreadyRenamed) {
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
        if (posterAlreadyRenamed) {
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

        return { success: true };
    } catch (error) {
        console.error(JSON.stringify({ event: 'transcoding_rename_failed', videoPath, videoId, error: String(error) }));
        throw error; // Re-throw to fail the Lambda and trigger retry
    }
}

/**
 * Delete partial MediaConvert outputs from derived bucket.
 * Deletes all files under d/<id>/<versionId>/ on transcoding failure.
 */
export async function deletePartialOutputs(videoId: string, versionId: string): Promise<void> {
    const derivedBucket = getDerivedImagesBucketName();

    // Prefix matches all files in this version's directory, including both
    // MediaConvert outputs and renamed outputs
    const prefix = getDerivedAssetIdVersionPrefix(videoId, versionId);

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
