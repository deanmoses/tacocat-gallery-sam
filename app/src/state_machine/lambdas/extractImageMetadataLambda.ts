import { Context, Handler, S3Event } from 'aws-lambda';
import { extractImageMetadata } from './extractImageMetadata';
import { createImage } from '../../lib/gallery/createImage/createImage';

/**
 * A Lambda that extracts metadata from an image stored in S3.
 */
export const handler: Handler = async (event: S3Event, context: Context, callback) => {
    const record = event.Records[0];
    //console.info('I got this event: ', event);

    if (!record.eventName.includes('Removed') && !record.eventName.includes('Created')) {
        console.info(`Unhandled event: [${record.eventName}]`);
        callback(`Unhandled event: [${record.eventName}]`);
    }

    // console.info('bucket name:', record.s3.bucket.name);
    // console.info('object key: ', record.s3.object.key);

    const image = await extractImageMetadata(record.s3.bucket.name, record.s3.object.key);
    const imagePath = record.s3.object.key;
    await createImage(imagePath, image);

    console.info('DONE!');
};
