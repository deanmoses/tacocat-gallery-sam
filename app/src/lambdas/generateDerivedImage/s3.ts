import { GetObjectCommand, PutObjectCommand, S3Client, NoSuchKey } from '@aws-sdk/client-s3';
import { env } from './env';

const originalImagesBucket = env('OriginalImagesBucket');
const optimizedImagesBucket = env('DerivedImagesBucket');
const originalImageKey = env('ORIGINAL_IMAGE_KEY');

const s3 = new S3Client({});

export const loadOriginalImage = async (id: string): Promise<Uint8Array | undefined> => {
    try {
        const response = await s3.send(
            new GetObjectCommand({
                Bucket: originalImagesBucket,
                Key: originalImageKey.replace('${ID}', id),
            }),
        );
        return response.Body && response.Body.transformToByteArray();
    } catch (err) {
        if (err instanceof NoSuchKey) return undefined;
        if (err?.name === 'AccessDenied') {
            throw `Access denied to bucket [${originalImagesBucket}] key [${id}]`;
        }
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
        if (err instanceof NoSuchKey) return undefined;
        throw err;
    }
};
