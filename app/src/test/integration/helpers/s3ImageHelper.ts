import * as fs from 'fs';
import path from 'path';
import { HeadObjectCommand, PutObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { isValidImagePath } from '../../../lib/gallery_path_utils/galleryPathUtils';
import { getDerivedImagesBucketName, getOriginalImagesBucketName } from '../../../lib/lambda_utils/Env';
import { fromPathToS3OriginalBucketKey } from '../../../lib/s3_utils/s3path';
import mime from 'mime/lite';

/**
 * Upload specified image to the Original Images S3 bucket.
 *
 * @param nameOfImageOnDisk name of an image in the test images folder
 * @param imagePath path of gallery image to which to upload it, such as /2001/12-31/image.jpg
 * @returns S3 versionId of uploaded image
 */
export async function uploadImage(nameOfImageOnDisk: string, imagePath: string): Promise<string> {
    console.info(`Uploading image [${nameOfImageOnDisk}] to [${imagePath}]...`);
    if (!isValidImagePath(imagePath)) throw new Error(`Invalid image path: [${imagePath}]`);
    const filePath = path.resolve(__dirname, '..', '..', 'data/images/', nameOfImageOnDisk);
    const command = new PutObjectCommand({
        Bucket: getOriginalImagesBucketName(),
        Key: fromPathToS3OriginalBucketKey(imagePath),
        Body: fs.createReadStream(filePath),
    });
    const mimeType = mime.getType(filePath);
    if (mimeType) {
        command.input.ContentType = mimeType;
    }
    const client = new S3Client({});
    const response = await client.send(command);
    if (response.$metadata.httpStatusCode != 200) {
        throw Error(`Got non-200 status code [${response.$metadata.httpStatusCode}] uploading image`);
    }
    if (!response.VersionId) throw Error(`No versionId from uploading image`);
    console.info(`Uploaded image [${nameOfImageOnDisk}] to [${imagePath}]. Version [${response.VersionId}]`);
    return response.VersionId;
}

/**
 * Throw error if image does NOT exist in the S3 original images bucket
 *
 * @param imagePath Path of image, such as /2001/12-31/image.jpg
 */
export async function assertOriginalImageExists(imagePath: string): Promise<void> {
    if (!(await originalImageExists(imagePath)))
        throw new Error(`[${imagePath}] must exist in originals bucket at start of suite`);
}

/**
 * Throw error if image exists in the S3 original images bucket
 *
 * @param imagePath Path of image, such as /2001/12-31/image.jpg
 */
export async function assertOriginalImageDoesNotExist(imagePath: string): Promise<void> {
    if (await originalImageExists(imagePath))
        throw new Error(`[${imagePath}] cannot exist in originals bucket at start of suite`);
}

/**
 * Throw error if image does NOT exist in the S3 derived images bucket
 *
 * @param imagePath Path of image, such as /2001/12-31/image.jpg
 */
export async function assertDerivedImageExists(imagePath: string): Promise<void> {
    if (!(await derivedImageExists(imagePath)))
        throw new Error(`[${imagePath}] must exist in derived bucket at start of suite`);
}

/**
 * Throw error if image exists in the S3 derived images bucket
 *
 * @param imagePath Path of image, such as /2001/12-31/image.jpg
 */
export async function assertDerivedImageDoesNotExist(imagePath: string): Promise<void> {
    if (await derivedImageExists(imagePath))
        throw new Error(`[${imagePath}] cannot exist in derived bucket at start of suite`);
}

/**
 * Return true if image exists in S3 original images bucket
 *
 * @param imagePath path of image like /2001/12-31/image.jpg
 */
export async function originalImageExists(imagePath: string): Promise<boolean> {
    if (!isValidImagePath(imagePath)) throw new Error(`Invalid image path: [${imagePath}]`);
    return await imageExists(imagePath, getOriginalImagesBucketName());
}

/**
 * Return true if image exists in S3 derived images bucket
 *
 * @param imagePath path of image like /2001/12-31/image.jpg
 */
export async function derivedImageExists(imagePath: string): Promise<boolean> {
    return await imageExists(`/i${imagePath}`, getDerivedImagesBucketName());
}

/**
 * Return true if image exists in S3.
 *
 * @param imagePath path of image like /2001/12-31/image.jpg
 * @param bucketName name of S3 bucket
 */
async function imageExists(imagePath: string, bucketName: string): Promise<boolean> {
    if (!imagePath) throw new Error(`empty image path`);
    if (!bucketName) throw new Error(`empty bucket name`);
    const key = imagePath.substring(1);
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
