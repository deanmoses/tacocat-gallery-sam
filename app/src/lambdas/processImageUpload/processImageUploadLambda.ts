import { Context, Handler, S3Event } from 'aws-lambda';
import { processImageUpload } from './processImageUpload';
import { isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';

/**
 * A Lambda that processes an image uploaded to S3.
 * Extracts metadata from image and saves entry to DynamoDB.
 */
export const handler: Handler = async (event: S3Event, context: Context, callback) => {
    const record = event.Records[0];

    console.trace(`Image processor: got event [${record?.eventName}]`);

    // Handle all ObjectCreated events EXCEPT for Copy
    if (
        !record?.eventName ||
        !record.eventName.includes('ObjectCreated') ||
        record.eventName.includes('ObjectCreated:Copy')
    ) {
        const msg = `Image processor: triggered by unexpected event [${record?.eventName}]. There's probably a misconfiguration.`;
        console.error(msg);
        if (!!callback) callback(msg);
    }
    // Don't handle files that aren't images in the right folder structure
    else {
        const imagePath = '/' + record?.s3?.object?.key;
        if (!isValidImagePath(imagePath)) {
            const msg = `Image Processor: invalid image path [${imagePath}].  Probably Dean uploaded via AWS S3 Console`;
            console.error(msg);
            if (!!callback) callback(msg);
        }
    }

    await processImageUpload(record?.s3?.bucket?.name, record?.s3?.object?.key);
};
