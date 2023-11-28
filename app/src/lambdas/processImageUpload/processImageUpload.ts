import { extractImageMetadata } from './extractImageMetadata';
import { setImageAsParentAlbumThumbnailIfNoneExists } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { getParentFromPath, isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { createAlbumNoThrow } from '../../lib/gallery/createAlbum/createAlbum';
import { upsertImage } from '../../lib/gallery/upsertImage/upsertImage';
import { ImageCreateRequest } from '../../lib/gallery/galleryTypes';

/**
 * Process an file uploaded to S3.
 * Verify that it's an image
 * Extracts metadata from image and saves entry to DynamoDB.
 *
 * @param bucket name of S3 bucket that file is in
 * @param key key of S3 object to process
 * @param versionId versionId of S3 object
 */
export async function processImageUpload(bucket: string, key: string, versionId: string | undefined): Promise<void> {
    console.info(`Image Processor: processing object key [${key}]`);
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
    if (!versionId) {
        throw new Error(`Image Processor: missing versionId`);
    }
    // The only time that parent albums won't exist is when I'm manually
    // uploading via the AWS Console.
    console.info(`Image Processor: ensuring parent albums exist for image [${key}]`);
    const albumPath = getParentFromPath(imagePath);
    const albumWasCreated = await createAlbumNoThrow(albumPath);
    if (albumWasCreated) {
        const grandparentAlbumPath = getParentFromPath(albumPath);
        await createAlbumNoThrow(grandparentAlbumPath);
    }
    console.info(`Image Processor: extracting metadata from [${key}]`);
    const imageCreateRequest: ImageCreateRequest = {
        versionId,
        ...(await extractImageMetadata(bucket, key)),
    };
    console.info(`Image Processor: creating image [${imagePath}] in DynamoDB`, imageCreateRequest);
    await upsertImage(imagePath, imageCreateRequest);
    console.info(`Image Processor: setting image [${imagePath}] as thumbnail of parent album if none exists`);
    await setImageAsParentAlbumThumbnailIfNoneExists(imagePath);
    console.info(`Image Processor: created or updated image [${imagePath}]`);
}
