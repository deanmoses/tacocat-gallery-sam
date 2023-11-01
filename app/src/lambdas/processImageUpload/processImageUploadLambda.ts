import { Context, Handler, S3Event } from 'aws-lambda';
import { extractImageMetadata } from './extractImageMetadata';
import { createImage } from '../../lib/gallery/createImage/createImage';

/**
 * A Lambda that processes an image uploaded to S3.
 * Extracts metadata from image and saves entry to DynamoDB.
 */
export const handler: Handler = async (event: S3Event, context: Context, callback) => {
    const record = event.Records[0];
    //console.info('event: ', event);

    if (!record.eventName.includes('Removed') && !record.eventName.includes('Created')) {
        console.info(`Unhandled event: [${record.eventName}]`);
        callback(`Unhandled event: [${record.eventName}]`);
    }

    console.info(`processImageUpload - object key: [${record.s3.object.key}]`);
    const imageMetadata = await extractImageMetadata(record.s3.bucket.name, record.s3.object.key);
    const imagePath = '/' + record.s3.object.key;
    // Create image in DynamoDB
    await createImage(imagePath, imageMetadata);

    console.info('DONE!');
};
