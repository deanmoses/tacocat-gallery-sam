import * as fs from 'fs';
import path from 'path';
import { HeadObjectCommand, PutObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { isValidVideoPath } from '../../../lib/gallery_path_utils/galleryPathUtils';
import { getOriginalImagesBucketName } from '../../../lib/lambda_utils/Env';
import { fromPathToS3OriginalBucketKeyForUpload } from '../../../lib/s3_utils/s3path';
import mime from 'mime';

/**
 * Upload specified video to the Original Images S3 bucket.
 *
 * @param nameOfVideoOnDisk name of a video in the test videos folder
 * @param videoPath path of gallery video to which to upload it, such as /2001/12-31/video.mp4
 * @returns S3 versionId of uploaded video
 */
export async function uploadVideo(nameOfVideoOnDisk: string, videoPath: string): Promise<string> {
    console.info(`Uploading video [${nameOfVideoOnDisk}] to [${videoPath}]...`);
    if (!isValidVideoPath(videoPath)) throw new Error(`Invalid video path: [${videoPath}]`);
    const filePath = path.resolve(__dirname, '..', '..', 'data/videos/', nameOfVideoOnDisk);
    if (!fs.existsSync(filePath)) {
        throw new Error(`Test video file not found: [${filePath}]`);
    }
    const command = new PutObjectCommand({
        Bucket: getOriginalImagesBucketName(),
        Key: fromPathToS3OriginalBucketKeyForUpload(videoPath),
        Body: fs.createReadStream(filePath),
    });
    const mimeType = mime.getType(filePath);
    if (mimeType) {
        command.input.ContentType = mimeType;
    }
    const client = new S3Client({});
    const response = await client.send(command);
    if (response.$metadata.httpStatusCode != 200) {
        throw Error(`Got non-200 status code [${response.$metadata.httpStatusCode}] uploading video`);
    }
    if (!response.VersionId) throw Error(`No versionId from uploading video`);
    console.info(`Uploaded video [${nameOfVideoOnDisk}] to [${videoPath}]. Version [${response.VersionId}]`);
    return response.VersionId;
}

/**
 * Throw error if video does NOT exist in the S3 original bucket
 *
 * @param videoPath Path of video, such as /2001/12-31/video.mp4
 */
export async function assertOriginalVideoExists(videoPath: string): Promise<void> {
    if (!(await originalVideoExists(videoPath)))
        throw new Error(`[${videoPath}] must exist in originals bucket at start of suite`);
}

/**
 * Throw error if video exists in the S3 original bucket
 *
 * @param videoPath Path of video, such as /2001/12-31/video.mp4
 */
export async function assertOriginalVideoDoesNotExist(videoPath: string): Promise<void> {
    if (await originalVideoExists(videoPath))
        throw new Error(`[${videoPath}] cannot exist in originals bucket at start of suite`);
}

/**
 * Return true if video exists in S3 original bucket.
 *
 * @param videoPath path of video like /2001/12-31/video.mp4
 */
export async function originalVideoExists(videoPath: string): Promise<boolean> {
    if (!isValidVideoPath(videoPath)) throw new Error(`Invalid video path: [${videoPath}]`);
    return await videoExists(videoPath, getOriginalImagesBucketName());
}

/**
 * Return true if video exists in S3.
 *
 * @param videoPath path of video like /2001/12-31/video.mp4
 * @param bucketName name of S3 bucket
 */
async function videoExists(videoPath: string, bucketName: string): Promise<boolean> {
    if (!videoPath) throw new Error(`empty video path`);
    if (!bucketName) throw new Error(`empty bucket name`);
    const key = videoPath.substring(1);
    const s3Command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
    });
    const client = new S3Client({});
    try {
        const response = await client.send(s3Command);
        return response.$metadata.httpStatusCode === 200;
    } catch (e) {
        if (e instanceof NotFound) {
            return false;
        }
        throw e;
    }
}
