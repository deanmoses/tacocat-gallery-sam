import { extractImageMetadata } from './extractImageMetadata';
import { createImage } from '../../lib/gallery/createImage/createImage';
import { setImageAsParentAlbumThumbnailIfNoneExists } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';

/**
 * Process an file uploaded to S3.
 * Verify that it's an image
 * Extracts metadata from image and saves entry to DynamoDB.
 *
 * @param bucket name of S3 bucket that file is in
 * @param key key of S3 object to process
 */
export async function processImageUpload(bucket: string, key: string): Promise<void> {
    console.trace(`Image Processor: processing object key [${key}]`);

    const imagePath = '/' + key;
    if (!isValidImagePath(imagePath)) {
        throw new Error(`Image Processor: invalid image path [${imagePath}]`);
    }
    if ('jpg' !== imagePath.split('.').pop()) {
        console.warn(`Image Processor: not a jpg [${imagePath}]`);
    }
    if (!bucket) {
        throw new Error(`Image Processor: invalid bucket name [${bucket}]`);
    }

    console.trace(`Image Processor: extracting metadata from [${key}]`);
    const imageMetadata = await extractImageMetadata(bucket, key);

    console.trace(`Image Processor: creating image [${imagePath}] in DynamoDB`);
    await createImage(imagePath, imageMetadata);

    console.trace(`Image Processor: setting image [${imagePath}] as thumbnail of parent album if none exists`);
    await setImageAsParentAlbumThumbnailIfNoneExists(imagePath);

    console.trace('Image Processor: DONE');
}
