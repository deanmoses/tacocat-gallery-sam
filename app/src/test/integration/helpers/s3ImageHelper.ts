import * as fs from 'fs';
import path from 'path';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { isValidImagePath, isValidImagePathForUpload } from '../../../lib/gallery_path_utils/galleryPathUtils';
import { getDerivedImagesBucketName, getOriginalImagesBucketName } from '../../../lib/lambda_utils/Env';
import { fromPathToS3OriginalBucketKeyForUpload } from '../../../lib/s3_utils/s3path';
import mime from 'mime';

/**
 * Upload specified image to the Original Images S3 bucket.
 * Accepts HEIC/HEIF files for upload (they will be converted server-side).
 *
 * @param nameOfImageOnDisk name of an image in the test images folder
 * @param imagePath path of gallery image to which to upload it, such as /2001/12-31/image.jpg or /2001/12-31/image.heic
 * @returns S3 versionId of uploaded image
 */
export async function uploadImage(nameOfImageOnDisk: string, imagePath: string): Promise<string> {
    console.info(`Uploading image [${nameOfImageOnDisk}] to [${imagePath}]...`);
    if (!isValidImagePathForUpload(imagePath)) throw new Error(`Invalid image path: [${imagePath}]`);
    const filePath = path.resolve(__dirname, '..', '..', 'data/images/', nameOfImageOnDisk);
    const command = new PutObjectCommand({
        Bucket: getOriginalImagesBucketName(),
        Key: fromPathToS3OriginalBucketKeyForUpload(imagePath),
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
 * Upload a Buffer directly to the Original Images S3 bucket.
 * Useful for testing with synthetic/corrupt files.
 *
 * @param buffer The buffer to upload
 * @param imagePath path of gallery image, such as /2001/12-31/image.heic
 * @returns S3 versionId of uploaded file
 */
export async function uploadBuffer(buffer: Buffer, imagePath: string): Promise<string> {
    console.info(`Uploading buffer to [${imagePath}]...`);
    if (!isValidImagePathForUpload(imagePath)) throw new Error(`Invalid image path: [${imagePath}]`);
    const command = new PutObjectCommand({
        Bucket: getOriginalImagesBucketName(),
        Key: fromPathToS3OriginalBucketKeyForUpload(imagePath),
        Body: buffer,
    });
    const mimeType = mime.getType(imagePath);
    if (mimeType) {
        command.input.ContentType = mimeType;
    }
    const client = new S3Client({});
    const response = await client.send(command);
    if (response.$metadata.httpStatusCode != 200) {
        throw Error(`Got non-200 status code [${response.$metadata.httpStatusCode}] uploading buffer`);
    }
    if (!response.VersionId) throw Error(`No versionId from uploading buffer`);
    console.info(`Uploaded buffer to [${imagePath}]. Version [${response.VersionId}]`);
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
 * Return true if image exists in S3 original images bucket.
 * Accepts HEIC/HEIF paths for checking if uploads exist before/after conversion.
 *
 * @param imagePath path of image like /2001/12-31/image.jpg or /2001/12-31/image.heic
 */
export async function originalImageExists(imagePath: string): Promise<boolean> {
    if (!isValidImagePathForUpload(imagePath)) throw new Error(`Invalid image path: [${imagePath}]`);
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

/**
 * Download an image from the S3 original images bucket and return as Buffer.
 *
 * @param imagePath path of image like /2001/12-31/image.jpg
 * @returns Buffer containing the image file contents
 */
export async function downloadOriginalImage(imagePath: string): Promise<Buffer> {
    if (!isValidImagePath(imagePath)) throw new Error(`Invalid image path: [${imagePath}]`);
    const key = imagePath.substring(1);
    const s3Command = new GetObjectCommand({
        Bucket: getOriginalImagesBucketName(),
        Key: key,
    });
    const client = new S3Client({});
    const response = await client.send(s3Command);
    const stream = response.Body as Readable;
    return Buffer.concat(await stream.toArray());
}
