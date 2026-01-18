import { GetObjectCommand, PutObjectCommand, S3Client, NoSuchKey } from '@aws-sdk/client-s3';
import { env } from './env';

const originalImagesBucket = env('ORIGINAL_IMAGES_BUCKET');
const optimizedImagesBucket = env('DERIVED_IMAGES_BUCKET');

const s3 = new S3Client({});

/**
 * Load original image from the Originals bucket.
 */
export const loadOriginalImage = async (id: string, versionId: string): Promise<Uint8Array | undefined> => {
    try {
        const response = await s3.send(
            new GetObjectCommand({
                Bucket: originalImagesBucket,
                Key: id,
                VersionId: versionId,
            }),
        );
        return response.Body && response.Body.transformToByteArray();
    } catch (err) {
        if (err instanceof NoSuchKey) return undefined;
        console.error(
            JSON.stringify({
                event: 'load_original_error',
                bucket: originalImagesBucket,
                key: id,
                versionId,
                error: String(err),
            }),
        );
        throw err;
    }
};

/**
 * Load video poster from the Derived bucket.
 * Video posters are stored at video/<UUID>.jpg
 */
export const loadVideoPoster = async (uuid: string): Promise<Uint8Array | undefined> => {
    const key = `video/${uuid}.jpg`;
    try {
        const response = await s3.send(
            new GetObjectCommand({
                Bucket: optimizedImagesBucket,
                Key: key,
            }),
        );
        return response.Body && response.Body.transformToByteArray();
    } catch (err) {
        if (err instanceof NoSuchKey) return undefined;
        console.error(
            JSON.stringify({
                event: 'load_video_poster_error',
                bucket: optimizedImagesBucket,
                key,
                error: String(err),
            }),
        );
        throw err;
    }
};

/**
 * Save an optimized/resized image to the Derived bucket.
 *
 * @param path URL path like "/i/2024/01-15/image.jpg/VERSIONID/200" - leading slash is stripped for S3 key
 * @param image The optimized image buffer
 * @param contentType MIME type (e.g., "image/jpeg", "image/webp")
 * @param cacheControl Cache-Control header value
 */
export const saveOptimizedImage = async (path: string, image: Buffer, contentType: string, cacheControl: string) => {
    try {
        await s3.send(
            new PutObjectCommand({
                Bucket: optimizedImagesBucket,
                Key: path.substring(1),
                Body: image,
                ContentType: contentType,
                CacheControl: cacheControl,
            }),
        );
    } catch (err) {
        console.error(
            JSON.stringify({
                event: 'save_optimized_error',
                bucket: optimizedImagesBucket,
                key: path.substring(1),
                error: String(err),
            }),
        );
        throw err;
    }
};
