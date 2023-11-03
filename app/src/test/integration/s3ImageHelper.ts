import * as fs from 'fs';
import path from 'path';
import { HeadObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';
import { getOriginalImagesBucketName } from '../../lib/lambda_utils/Env';

/**
 * Upload specified image to the Original Images S3 bucket.
 *
 * @param nameOfImageOnDisk name of an image in the test images folder
 * @param albumPath path of album in which to upload it, such as /2001/12-31/
 * @param newNameOfImage name to save as in S3.  If not specified, uses name of image on disk
 */
export async function uploadImage(nameOfImageOnDisk: string, albumPath: string, newNameOfImage: string) {
    if (!isValidAlbumPath(albumPath)) throw new Error(`Invalid album path: [${albumPath}]`);

    const filePath = path.resolve(__dirname, '..', '..', 'test/data/images/', nameOfImageOnDisk);
    const fileStream = fs.createReadStream(filePath);
    const key = albumPath.substring(1) + (!newNameOfImage ? nameOfImageOnDisk : newNameOfImage);
    const parallelUploads3 = new Upload({
        params: {
            Bucket: getOriginalImagesBucketName(),
            Key: key,
            Body: fileStream,
        },
        queueSize: 4, // optional concurrency configuration
        leavePartsOnError: false, // optional manually handle dropped parts
        client: new S3Client({}),
    });

    // parallelUploads3.on('httpUploadProgress', (progress: unknown) => {
    //     console.log(progress);
    // });

    const results = await parallelUploads3.done();
    return results;
}

/**
 * Return true if image exists in S3.
 *
 * @param imagePath path of image like /2001/12-31/image.jpg
 */
export async function originalImageExists(imagePath: string) {
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
