import { S3Client, HeadObjectCommand, NotFound } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

/**
 * Check if an S3 object exists.
 *
 * @param bucket S3 bucket name
 * @param key S3 object key
 * @returns true if object exists, false otherwise
 */
export async function objectExists(bucket: string, key: string): Promise<boolean> {
    try {
        await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    } catch (err) {
        if (err instanceof NotFound) return false;
        throw err;
    }
}
