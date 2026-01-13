import { extractImageMetadata, MetadataExtractionError } from './extractImageMetadata';
import { convertHeicToJpeg, SharpProcessingError } from './convertHeicToJpeg';
import { setImageAsParentAlbumThumbnailIfNoneExists } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import {
    getParentFromPath,
    isValidImagePath,
    isValidImagePathForUpload,
    isHeicPath,
} from '../../lib/gallery_path_utils/galleryPathUtils';
import { createAlbumNoThrow } from '../../lib/gallery/createAlbum/createAlbum';
import { upsertImage } from '../../lib/gallery/upsertImage/upsertImage';
import { ImageCreateRequest, Size } from '../../lib/gallery/galleryTypes';
import { getGalleryAppDomain } from '../../lib/lambda_utils/Env';
import { quarantineFile } from '../../lib/s3_utils/quarantineFile';

/**
 * Process a file uploaded to S3.
 * - For HEIC/HEIF: converts to JPEG and returns (S3 re-triggers for the JPEG)
 * - For other images: extracts metadata and saves entry to DynamoDB
 *
 * @param bucket name of S3 bucket that file is in
 * @param key key of S3 object to process
 * @param versionId versionId of S3 object
 */
export async function processImageUpload(bucket: string, key: string, versionId: string | undefined): Promise<void> {
    console.info(`Image Processor: processing object key [${key}]`);
    const imagePath = '/' + key;
    if (!isValidImagePathForUpload(imagePath)) {
        throw new Error(`Image Processor: invalid image path [${imagePath}]`);
    }
    if (!bucket) {
        throw new Error(`Image Processor: invalid bucket name [${bucket}]`);
    }
    if (!versionId) {
        throw new Error(`Image Processor: missing versionId`);
    }

    // HEIC conversion: convert to JPEG and return early
    // S3 will re-trigger this Lambda for the new JPEG
    if (isHeicPath(key)) {
        try {
            await convertHeicToJpeg(bucket, key);
        } catch (error) {
            // Only quarantine on Sharp processing errors (corrupt/invalid file)
            // Let S3/infrastructure errors propagate for Lambda retry
            if (error instanceof SharpProcessingError) {
                console.error(`HEIC conversion failed, quarantining`, { key, error: error.message });
                await quarantineFile(bucket, key);
            } else {
                throw error;
            }
        }
        return; // Let S3 re-trigger for the JPEG
    }

    // From here on, we're processing a non-HEIC image (jpg/jpeg/gif/png)
    if (!isValidImagePath(imagePath)) {
        throw new Error(`Image Processor: invalid image path for storage [${imagePath}]`);
    }
    if ('jpg' !== imagePath.split('.').pop()?.toLowerCase()) {
        console.warn(`Image Processor: not a jpg [${imagePath}]`);
    }

    // The only time parent albums won't exist is when I manually upload via AWS Console
    console.info(`Image Processor: ensuring parent albums exist for image [${key}]`);
    const albumPath = getParentFromPath(imagePath);
    const albumWasCreated = await createAlbumNoThrow(albumPath);
    if (albumWasCreated) {
        const grandparentAlbumPath = getParentFromPath(albumPath);
        await createAlbumNoThrow(grandparentAlbumPath);
    }

    // Extract metadata - quarantine only on file processing errors
    console.info(`Image Processor: extracting metadata from [${key}]`);
    let extractedMetadata;
    try {
        extractedMetadata = await extractImageMetadata(bucket, key);
    } catch (error) {
        // Only quarantine on metadata extraction errors (corrupt/invalid file)
        // Let S3/infrastructure errors propagate for Lambda retry
        if (error instanceof MetadataExtractionError) {
            console.error(`Metadata extraction failed, quarantining`, { key, error: error.message });
            await quarantineFile(bucket, key);
            return;
        }
        throw error;
    }

    const imageCreateRequest: ImageCreateRequest = {
        versionId,
        ...extractedMetadata,
    };

    // DynamoDB, album thumbnail, detail image - let errors propagate for retry
    console.info(`Image Processor: creating image [${imagePath}] in DynamoDB\n`, imageCreateRequest);
    await upsertImage(imagePath, imageCreateRequest);
    console.info(`Image Processor: setting image [${imagePath}] as thumbnail of parent album if none exists`);
    await setImageAsParentAlbumThumbnailIfNoneExists(imagePath);
    console.info(`Image Processor: generating detail image for [${imagePath}]`);
    if (imageCreateRequest.dimensions) {
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
