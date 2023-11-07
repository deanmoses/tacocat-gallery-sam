import { S3Client, ListObjectsV2Command, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { getOriginalImagesBucketName } from '../lambda_utils/Env';
import { fromPathToS3OriginalBucketKey } from './s3path';

export async function listOriginalImages(albumPath: string): Promise<ListObjectsV2CommandOutput> {
    const albumKey = fromPathToS3OriginalBucketKey(albumPath);
    const listCommand = new ListObjectsV2Command({
        Bucket: getOriginalImagesBucketName(), // Destination bucket
        Prefix: albumKey,
    });
    const client = new S3Client({});
    return await client.send(listCommand);
}
