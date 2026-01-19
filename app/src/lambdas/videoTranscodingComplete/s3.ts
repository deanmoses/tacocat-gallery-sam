import { S3Client, DeleteObjectCommand, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getNameFromPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { getDerivedImagesBucketName } from '../../lib/lambda_utils/Env';
import { objectExists } from '../../lib/s3_utils/s3exists';

const s3Client = new S3Client({});

/**
 * Rename MediaConvert outputs from original filename to UUID-based names.
 * MediaConvert outputs: video/<filename>_transcoded.mp4 and video/<filename>_poster.0000000.jpg
 * We rename to: video/<UUID>.mp4 and video/<UUID>.jpg
 *
 * This function is idempotent: if the destination already exists (from a previous Lambda
 * invocation), it skips the copy and just cleans up any remaining source files.
 */
export async function renameMediaConvertOutputs(videoPath: string, videoId: string): Promise<void> {
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

/**
 * Delete partial MediaConvert outputs from derived bucket.
 * Uses original filename pattern to find and delete partial outputs on transcoding failure.
 */
export async function deletePartialOutputs(videoPath: string): Promise<void> {
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
