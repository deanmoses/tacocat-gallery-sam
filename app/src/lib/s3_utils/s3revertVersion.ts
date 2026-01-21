import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({});

/**
 * Revert an S3 object to its previous version by deleting the specified version.
 *
 * In a versioned S3 bucket, deleting a specific version removes that version
 * and makes the previous version current.
 *
 * If no previous version exists, the object is effectively deleted.
 *
 * Does not throw on failure - logs error and returns false.
 *
 * @param bucket S3 bucket name
 * @param key S3 object key (without leading slash)
 * @param versionId Version ID to delete
 * @returns true if reverted successfully, false otherwise
 */
export async function revertS3Version(bucket: string, key: string, versionId: string): Promise<boolean> {
    try {
        await s3Client.send(
            new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
                VersionId: versionId,
            }),
        );
        console.info(JSON.stringify({ event: 'version_deleted', key, versionId }));
        return true;
    } catch (error) {
        console.error(JSON.stringify({ event: 'version_delete_failed', key, versionId, error: String(error) }));
        return false;
    }
}
