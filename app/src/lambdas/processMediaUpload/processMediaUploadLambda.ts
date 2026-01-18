import { S3Handler } from 'aws-lambda';
import { processMediaUpload } from './processMediaUpload';
import { isValidAlbumPath, isValidMediaPathForUpload } from '../../lib/gallery_path_utils/galleryPathUtils';

/**
 * A Lambda that processes images and videos uploaded to S3.
 * - For images: extracts metadata and saves entry to DynamoDB
 * - For HEIC images: converts to JPEG first
 * - For videos: creates MediaConvert job for transcoding
 */
export const handler: S3Handler = async (event) => {
    const record = event.Records[0];
    const key = record?.s3?.object?.key;

    console.info(JSON.stringify({ event: 's3_event_received', eventName: record?.eventName, key }));

    if (!key) {
        throw new Error(`Media Processor: missing object key in S3 event`);
    }

    // Handle all ObjectCreated events EXCEPT for Copy
    if (
        !record?.eventName ||
        !record.eventName.includes('ObjectCreated') ||
        record.eventName.includes('ObjectCreated:Copy')
    ) {
        console.error(JSON.stringify({ event: 's3_unexpected_event', eventName: record?.eventName, key }));
        // Return normally to prevent S3 from retrying
        return;
    }

    // Don't handle files that aren't media in the right folder structure
    // Use isValidMediaPathForUpload to accept images, HEIC/HEIF, and videos
    const mediaPath = '/' + key;
    if (!isValidMediaPathForUpload(mediaPath)) {
        if (isValidAlbumPath(mediaPath)) {
            console.info(JSON.stringify({ event: 's3_album_folder_created', mediaPath }));
        } else {
            console.error(JSON.stringify({ event: 's3_invalid_media_path', mediaPath }));
        }
        // Return normally to prevent S3 from retrying
        return;
    }

    const bucket = record?.s3?.bucket?.name;
    const versionId = record?.s3?.object?.versionId;

    await processMediaUpload(bucket, key, versionId);
};
