import { GetObjectCommand, PutObjectCommand, S3Client, NoSuchKey } from '@aws-sdk/client-s3';
import { env } from './env';

const originalImagesBucket = env('ORIGINAL_IMAGES_BUCKET');
const optimizedImagesBucket = env('DERIVED_IMAGES_BUCKET');

const s3 = new S3Client({});

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
            `Error loading original image from bucket [${originalImagesBucket}] key [${id}] version [${versionId}]: `,
            err,
        );
        throw err;
    }
};

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
            `Error saving optimized image to bucket [${optimizedImagesBucket}] key [${path.substring(1)}]: `,
            err,
        );
        throw err;
    }
};
