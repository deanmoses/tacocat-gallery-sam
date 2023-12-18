import { extractImageMetadata } from './extractImageMetadata';
import { setImageAsParentAlbumThumbnailIfNoneExists } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { getParentFromPath, isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { createAlbumNoThrow } from '../../lib/gallery/createAlbum/createAlbum';
import { upsertImage } from '../../lib/gallery/upsertImage/upsertImage';
import { ImageCreateRequest, Size } from '../../lib/gallery/galleryTypes';
import { getGalleryAppDomain } from '../../lib/lambda_utils/Env';

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
    // The only time parent albums won't exist is when I manually upload via AWS Console
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
    console.info(`Image Processor: creating image [${imagePath}] in DynamoDB\n`, imageCreateRequest);
    await upsertImage(imagePath, imageCreateRequest);
    console.info(`Image Processor: setting image [${imagePath}] as thumbnail of parent album if none exists`);
    await setImageAsParentAlbumThumbnailIfNoneExists(imagePath);
    console.info(`Image Processor: generating detail image for [${imagePath}]`);
    if (!!imageCreateRequest.dimensions) {
        await generateDetailImage(imagePath, versionId, imageCreateRequest.dimensions);
    } else {
        console.error(
            `Image Processor: not generating detail image for [${imagePath}] because no dimensions were extracted`,
        );
    }
    console.info(`Image Processor: done processing image [${imagePath}]`);
}

async function generateDetailImage(imagePath: string, versionId: string, dimensions: Size): Promise<void> {
    const width = detailWidth(dimensions.width, dimensions.height);
    const height = detailHeight(dimensions.width, dimensions.height);
    const sizing = width > height ? width.toString() : 'x' + height.toString();
    const detailImageUrl = imageDetailUrl(imagePath, versionId, sizing);
    console.info(`Image Processor: detail image URL for [${imagePath}] is [${detailImageUrl}]`);
    const result = await fetch(imageDetailUrl(imagePath, versionId, sizing));
    if (!result.ok) {
        console.error(
            `Image Processor: error generating detail image for [${imagePath}] ${result.status}`,
            result.statusText,
        );
    }
}

/** Return URL of the format https://img.pix.tacocat.com/i/2001/12-01/image.jpg?version=VERSION&size=x1024 */
function imageDetailUrl(imagePath: string, versionId: string, size: string) {
    return `https://img.${getGalleryAppDomain()}/i${imagePath}?version=${versionId}&size=${size}`;
}

/** Width of detail image */
function detailWidth(width: number, height: number): number {
    if (!width) {
        return 1024;
    } else if (!height || width > height) {
        // Don't enlarge images smaller than 1024
        return width < 1024 ? width : 1024;
    } else {
        return Math.round(1024 * (width / height));
    }
}

/** Height of detail image */
function detailHeight(width: number, height: number): number {
    if (!height) {
        return 1024;
    } else if (!width || height > width) {
        // Don't enlarge images smaller than 1024
        return height < 1024 ? height : 1024;
    } else {
        return Math.round(1024 * (height / width));
    }
}
