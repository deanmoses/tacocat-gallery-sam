import { S3Client, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Move a file to the quarantine folder in the same bucket.
 * Used for files that fail processing (e.g., corrupt images, conversion failures).
 *
 * @param bucket S3 bucket name
 * @param key Original S3 object key (e.g., '2024/01-15/photo.heic')
 */
export async function quarantineFile(bucket: string, key: string): Promise<void> {
    const quarantineKey = `quarantine/${key}`;
    console.info(`Quarantining file: ${key} -> ${quarantineKey}`);

    const client = new S3Client({});

    // Copy to quarantine location
    await client.send(
        new CopyObjectCommand({
            Bucket: bucket,
            CopySource: `${bucket}/${key}`,
            Key: quarantineKey,
        }),
    );

    // Delete original
    await client.send(
        new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
        }),
    );

    console.info(`Quarantined file: ${key}`);
}
