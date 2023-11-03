import { Context, Handler, S3Event } from 'aws-lambda';
import { processImageUpload } from './processImageUpload';

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
        console.error(
            `Image processor: got unexpected event [${record?.eventName}]. There's probably a misconfiguration.`,
        );
        if (!!callback) {
            callback(`Unhandled event: [${record?.eventName}]`);
        }
    }

    await processImageUpload(record?.s3?.bucket?.name, record?.s3?.object?.key);
};
