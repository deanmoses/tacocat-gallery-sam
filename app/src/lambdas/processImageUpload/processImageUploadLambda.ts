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
    //console.info('event: ', event);

    if (!record.eventName.includes('Removed') && !record.eventName.includes('Created')) {
        console.info(`Unhandled event: [${record.eventName}]`);
        callback(`Unhandled event: [${record.eventName}]`);
    }

    console.info(`processImageUpload - object key: [${record.s3.object.key}]`);

    // Extract EXIF / IPTC metadata from image
    const imageMetadata = await extractImageMetadata(record.s3.bucket.name, record.s3.object.key);

    // Create image in DynamoDB
    const imagePath = '/' + record.s3.object.key;
    console.info(`Creating image [${imagePath}] in DynamoDB`);
    await createImage(imagePath, imageMetadata);

    // Set image as its album's thumbnail, if the album does not already have a thumbnail
    console.info(`Setting image [${imagePath}] as thumbnail of parent album if none exists`);
    await setImageAsParentAlbumThumbnailIfNoneExists(imagePath);

    console.info('DONE!');
};
