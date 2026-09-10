import { ListObjectsV2Command, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';
import { getOriginalImagesBucketName } from '../lambda_utils/Env';
import { fromPathToS3OriginalBucketKey } from './s3path';
import { s3Client } from './s3Client';

export async function listOriginalImages(albumPath: string): Promise<ListObjectsV2CommandOutput> {
    const albumKey = fromPathToS3OriginalBucketKey(albumPath);
    const listCommand = new ListObjectsV2Command({
        Bucket: getOriginalImagesBucketName(),
        Prefix: albumKey,
    });
    return await s3Client.send(listCommand);
}
