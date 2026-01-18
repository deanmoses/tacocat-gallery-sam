import { extractImageMetadata, MetadataExtractionError } from './extractImageMetadata';
import { setImageAsParentAlbumThumbnailIfNoneExists } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { getParentFromPath, isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { createAlbumNoThrow } from '../../lib/gallery/createAlbum/createAlbum';
import { upsertImage } from '../../lib/gallery/upsertImage/upsertImage';
import { ImageCreateRequest, Size } from '../../lib/gallery/galleryTypes';
import { getGalleryAppDomain } from '../../lib/lambda_utils/Env';
import { revertS3Version } from '../../lib/s3_utils/s3revertVersion';
import { recordMediaProcessingError } from '../../lib/dynamo_utils/recordError';

/**
 * Process an image uploaded to S3.
 * Extracts metadata and saves entry to DynamoDB.
 *
 * @param bucket name of S3 bucket that file is in
 * @param key key of S3 object to process
 * @param versionId versionId of S3 object
 */
export async function processImageUpload(bucket: string, key: string, versionId: string | undefined): Promise<void> {
    const imagePath = '/' + key;
    console.info(JSON.stringify({ event: 'image_processing_started', imagePath }));
    if (!isValidImagePath(imagePath)) {
        throw new Error(`Image Processor: invalid image path [${imagePath}]`);
    }
    if (!bucket) {
        throw new Error(`Image Processor: invalid bucket name [${bucket}]`);
    }
    if (!versionId) {
        throw new Error(`Image Processor: missing versionId`);
    }

    if ('jpg' !== imagePath.split('.').pop()?.toLowerCase()) {
        console.warn(JSON.stringify({ event: 'image_not_jpg', imagePath }));
    }

    // The only time parent albums won't exist is when I manually upload via AWS Console
    const albumPath = getParentFromPath(imagePath);
    const albumWasCreated = await createAlbumNoThrow(albumPath);
    if (albumWasCreated) {
        const grandparentAlbumPath = getParentFromPath(albumPath);
        await createAlbumNoThrow(grandparentAlbumPath);
    }

    let extractedMetadata;
    try {
        extractedMetadata = await extractImageMetadata(bucket, key);
    } catch (error) {
        // If corrupt/invalid file
        if (error instanceof MetadataExtractionError) {
            // Reverts version and logs error so client can see it
            await handleMetadataExtractionError(bucket, key, versionId, imagePath, error.message);
            return;
        }
        // Propagate S3/infrastructure errors so that Lambda will be retried
        throw error;
    }

    const imageCreateRequest: ImageCreateRequest = {
        versionId,
        ...extractedMetadata,
    };

    // DynamoDB, album thumbnail, detail image - let errors propagate for retry
    await upsertImage(imagePath, imageCreateRequest);
    console.info(
        JSON.stringify({
            event: 'image_dynamo_written',
            imagePath,
            versionId,
            dimensions: imageCreateRequest.dimensions,
        }),
    );

    await setImageAsParentAlbumThumbnailIfNoneExists(imagePath);

    if (imageCreateRequest.dimensions) {
        await generateDetailImage(imagePath, versionId, imageCreateRequest.dimensions);
    } else {
        console.error(JSON.stringify({ event: 'image_no_dimensions', imagePath }));
    }

    console.info(JSON.stringify({ event: 'image_processing_complete', imagePath }));
}

async function generateDetailImage(imagePath: string, versionId: string, dimensions: Size): Promise<void> {
    const width = detailWidth(dimensions.width, dimensions.height);
    const height = detailHeight(dimensions.width, dimensions.height);
    const sizing = width > height ? width.toString() : 'x' + height.toString();
    const detailImageUrl = imageDetailUrl(imagePath, versionId, sizing);
    const result = await fetch(detailImageUrl);
    if (!result.ok) {
        console.error(
            JSON.stringify({
                event: 'image_detail_generation_failed',
                imagePath,
                status: result.status,
                statusText: result.statusText,
            }),
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

/**
 * Handle metadata extraction error by recording error and reverting S3 version.
 */
async function handleMetadataExtractionError(
    bucket: string,
    key: string,
    versionId: string,
    imagePath: string,
    errorMessage: string,
): Promise<void> {
    const fullErrorMsg = `Metadata extraction failed: ${errorMessage}`;
    console.error(JSON.stringify({ event: 'metadata_extraction_failed', key, error: errorMessage }));
    const errorRecordedSuccess = await recordMediaProcessingError(imagePath, fullErrorMsg);
    const versionRevertedSuccess = await revertS3Version(bucket, key, versionId);
    console.info(
        JSON.stringify({
            event: 'metadata_error_cleanup',
            key,
            errorRecorded: errorRecordedSuccess,
            versionReverted: versionRevertedSuccess,
        }),
    );
}
