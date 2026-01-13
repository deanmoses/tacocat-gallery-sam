import { S3Handler } from 'aws-lambda';
import { processImageUpload } from './processImageUpload';
import { isValidAlbumPath, isValidImagePathForUpload } from '../../lib/gallery_path_utils/galleryPathUtils';

/**
 * A Lambda that processes an image uploaded to S3.
 * Extracts metadata from image and saves entry to DynamoDB.
 * For HEIC uploads, converts to JPEG first.
 */
export const handler: S3Handler = async (event) => {
    const record = event.Records[0];
    const key = record?.s3?.object?.key;

    console.info(`Image Processor: got event [${record?.eventName}]`);

    if (!key) {
        throw new Error(`Image Processor: missing object key in S3 event`);
    }

    // Skip quarantined files to prevent infinite loops
    if (key.startsWith('quarantine/')) {
        console.info(`Image Processor: skipping quarantined file [${key}]`);
        return;
    }

    // Handle all ObjectCreated events EXCEPT for Copy
    if (
        !record?.eventName ||
        !record.eventName.includes('ObjectCreated') ||
        record.eventName.includes('ObjectCreated:Copy')
    ) {
        const msg = `Image processor: triggered by unexpected event [${record?.eventName}]. There's probably a misconfiguration.`;
        console.error(msg);
        // Return normally to prevent S3 from retrying
        return;
    }

    // Don't handle files that aren't images in the right folder structure
    // Use isValidImagePathForUpload to accept HEIC/HEIF uploads
    const imagePath = '/' + key;
    if (!isValidImagePathForUpload(imagePath)) {
        if (isValidAlbumPath(imagePath)) {
            console.info(
                `Image Processor: album folder created [${imagePath}].  Probably Dean created via AWS S3 Console`,
            );
        } else {
            console.error(
                `Image Processor: invalid image path [${imagePath}].  Probably Dean uploaded via AWS S3 Console`,
            );
        }
        // Return normally to prevent S3 from retrying
        return;
    }

    await processImageUpload(record?.s3?.bucket?.name, key, record?.s3?.object?.versionId);
};
