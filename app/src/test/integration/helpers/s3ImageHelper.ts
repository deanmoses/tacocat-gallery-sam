import * as fs from 'fs';
import path from 'path';
import { HeadObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { isValidImagePath } from '../../../lib/gallery_path_utils/pathValidator';
import { getDerivedImagesBucketName, getOriginalImagesBucketName } from '../../../lib/lambda_utils/Env';

/**
 * Upload specified image to the Original Images S3 bucket.
 *
 * @param nameOfImageOnDisk name of an image in the test images folder
 * @param imagePath path of gallery image to which to upload it, such as /2001/12-31/image.jpg
 */
export async function uploadImage(nameOfImageOnDisk: string, imagePath: string) {
    console.info(`Uploading image [${nameOfImageOnDisk}] to [${imagePath}]...`);
    if (!isValidImagePath(imagePath)) throw new Error(`Invalid image path: [${imagePath}]`);
    const filePath = path.resolve(__dirname, '..', '..', 'data/images/', nameOfImageOnDisk);
    const fileStream = fs.createReadStream(filePath);
    const key = imagePath.substring(1);
    const upload = new Upload({
        params: {
            Bucket: getOriginalImagesBucketName(),
            Key: key,
            Body: fileStream,
        },
        queueSize: 4, // optional concurrency configuration
        leavePartsOnError: false, // optional manually handle dropped parts
        client: new S3Client({}),
    });

    // upload.on('httpUploadProgress', (progress: unknown) => {
    //     console.info(progress);
    // });

    const results = await upload.done();
    if (results.$metadata.httpStatusCode != 200) {
        throw Error(`Got non-200 status code [${results.$metadata.httpStatusCode}] uploading image`);
    }
    console.info(`Uploaded image [${nameOfImageOnDisk}] to [${imagePath}]`);
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
