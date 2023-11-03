import { Context, Handler, S3Event } from 'aws-lambda';
import { extractImageMetadata } from './extractImageMetadata';
import { createImage } from '../../lib/gallery/createImage/createImage';
import { setImageAsParentAlbumThumbnailIfNoneExists } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';

/**
 * A Lambda that processes an image uploaded to S3.
 * Extracts metadata from image and saves entry to DynamoDB.
 */
export const handler: Handler = async (event: S3Event, context: Context, callback) => {
    const record = event.Records[0];

    console.info(`Image processor: got event [${record?.eventName}]`);

    // Handle all ObjectCreated events EXCEPT for Copy
    if (
        !record?.eventName ||
        !record.eventName.includes('ObjectCreated') ||
        record.eventName.includes('ObjectCreated:Copy')
    ) {
        console.warn(
            `Image processor: got unexpected event [${record?.eventName}]. There's probably a misconfiguration.`,
        );
        if (!!callback) {
            callback(`Unhandled event: [${record?.eventName}]`);
        }
    }

    console.info(`Image Processor: processing object key [${record.s3.object.key}]`);

    // Extract EXIF / IPTC metadata from image
    const imageMetadata = await extractImageMetadata(record.s3.bucket.name, record.s3.object.key);

    // Create image in DynamoDB
    const imagePath = '/' + record.s3.object.key;
    console.info(`Image Processor: creating image [${imagePath}] in DynamoDB`);
    await createImage(imagePath, imageMetadata);

    // Set image as its album's thumbnail, if the album does not already have a thumbnail
    console.info(`Image Processor: setting image [${imagePath}] as thumbnail of parent album if none exists`);
    await setImageAsParentAlbumThumbnailIfNoneExists(imagePath);

    console.info('Image Processor: DONE');
};
