import { S3Client, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getOriginalImagesBucketName } from '../lambda_utils/Env';
import { listOriginalImages } from './s3list';
import { fromPathToS3OriginalBucketKey, fromS3OriginalBucketKeyToPath } from './s3path';
import { isValidAlbumPath, isValidImagePath } from '../gallery_path_utils/pathValidator';
import { getNameFromPath } from '../gallery_path_utils/getNameFromPath';

/**
 * Duplicate album's images to new path in S3 originals bucket.
 * Leaves old images intact.
 *
 * @param oldAlbumPath Path of source album like /2001/12-31/
 * @param newAlbumPath Path of destination album like /2001/12-29/
 */
export async function copyOriginals(oldAlbumPath: string, newAlbumPath: string): Promise<void> {
    console.info(`Copying original images from album [${oldAlbumPath}] to [${newAlbumPath}]...`);
    if (!isValidAlbumPath(oldAlbumPath)) throw new Error(`Cannot copy, invalid old album path [${oldAlbumPath}]`);
    if (!isValidAlbumPath(newAlbumPath)) throw new Error(`Cannot copy, invalid new album path [${newAlbumPath}]`);

    // I'm pretty sure this is the right way to copy a "folder" of images:
    // just iterate over all the objects and copy them individually.
    // AWS *does* have a batch job thing, but it's for large scale, millions of objects.
    // But it's weird because I can bulk DELETE, why the inconsistency?
    const list = await listOriginalImages(oldAlbumPath);
    list.Contents?.forEach(async (oldItem) => {
        if (!oldItem.Key) throw new Error(`Blank key in S3 image item ${oldItem}`);
        const oldImagePath = fromS3OriginalBucketKeyToPath(oldItem.Key);
        const imageName = getNameFromPath(oldImagePath);
        if (!imageName) throw new Error(`No image name found in path [${oldImagePath}]`);
        const newImagePath = newAlbumPath + imageName;
        await copyOriginal(oldImagePath, newImagePath);
    });
}

/**
 * Duplicate image from one path to another in S3 originals bucket.
 * Leaves old image intact.
 *
 * @param newImagePath path of source image like /2001/12-31/image.jpg
 * @param oldImagePath path of destination image like /2001/12-31/new_name.jpg
 */
export async function copyOriginal(oldImagePath: string, newImagePath: string): Promise<void> {
    console.info(`Copying original image from [${oldImagePath}] to [${newImagePath}]...`);
    if (!isValidImagePath(oldImagePath)) throw new Error(`Cannot copy, invalid old image path [${oldImagePath}]`);
    if (!isValidImagePath(newImagePath)) throw new Error(`Cannot copy, invalid new image path [${newImagePath}]`);
    const copyCommand = new CopyObjectCommand({
        CopySource: `${getOriginalImagesBucketName()}${oldImagePath}`,
        Bucket: getOriginalImagesBucketName(), // Destination bucket
        Key: fromPathToS3OriginalBucketKey(newImagePath), // Destination key
    });
    const client = new S3Client({});
    await client.send(copyCommand);
}
