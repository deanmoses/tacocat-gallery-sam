import { S3Handler } from 'aws-lambda';
import { processMediaUpload } from './processMediaUpload';

/**
 * A Lambda that processes images and videos uploaded to S3.
 * - For images: extracts metadata and saves entry to DynamoDB
 * - For HEIC images: converts to JPEG first
 * - For videos: creates MediaConvert job for transcoding
 */
export const handler: S3Handler = async (event) => {
    // Process all records in the batch (S3 can batch multiple uploads)
    for (const record of event.Records) {
        const key = record?.s3?.object?.key;

        console.info(JSON.stringify({ event: 's3_event_received', eventName: record?.eventName, key }));

        if (!key) {
            console.error(JSON.stringify({ event: 's3_missing_key', record }));
            continue;
        }

        // Handle all ObjectCreated events EXCEPT for Copy
        if (
            !record?.eventName ||
            !record.eventName.includes('ObjectCreated') ||
            record.eventName.includes('ObjectCreated:Copy')
        ) {
            console.error(JSON.stringify({ event: 's3_unexpected_event', eventName: record?.eventName, key }));
            continue;
        }

        const bucket = record?.s3?.bucket?.name;
        const versionId = record?.s3?.object?.versionId;

        await processMediaUpload(bucket, key, versionId);
    }
};
