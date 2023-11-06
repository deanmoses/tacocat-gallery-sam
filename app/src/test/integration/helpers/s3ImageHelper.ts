import * as fs from 'fs';
import path from 'path';
import { HeadObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { isValidImagePath } from '../../../lib/gallery_path_utils/pathValidator';
import { getOriginalImagesBucketName } from '../../../lib/lambda_utils/Env';

/**
 * Upload specified image to the Original Images S3 bucket.
 *
 * @param nameOfImageOnDisk name of an image in the test images folder
 * @param imagePath path of imagate to which to upload it, such as /2001/12-31/image.jpg
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
 * Return true if image exists in S3.
 *
 * @param imagePath path of image like /2001/12-31/image.jpg
 */
export async function imageExistsInOriginalsBucket(imagePath: string): Promise<boolean> {
    if (!isValidImagePath(imagePath)) throw new Error(`Invalid image path: [${imagePath}]`);
    const key = imagePath.substring(1);
    const s3Command = new HeadObjectCommand({
        Bucket: getOriginalImagesBucketName(),
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

export async function assertImageExistsInOriginalsBucket(imagePath: string): Promise<void> {
    if (!(await imageExistsInOriginalsBucket(imagePath)))
        throw new Error(`Suite can't run because [${imagePath}] exists in S3 original images bucket`);
}

export async function assertImageDoesNotExistInOriginalsBucket(imagePath: string): Promise<void> {
    if (await imageExistsInOriginalsBucket(imagePath))
        throw new Error(`Suite can't run because [${imagePath}] does not exist in S3 original images bucket`);
}
