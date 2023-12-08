import { S3Client, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getOriginalImagesBucketName } from '../lambda_utils/Env';
import { listOriginalImages } from './s3list';
import { fromPathToS3OriginalBucketKey, fromS3OriginalBucketKeyToPath } from './s3path';
import { getNameFromPath, isValidAlbumPath, isValidImagePath } from '../gallery_path_utils/galleryPathUtils';

/**
 * Duplicate album's images to new path in S3 originals bucket.
 * Leaves old images intact.
 *
 * @param oldAlbumPath Path of source album like /2001/12-31/
 * @param newAlbumPath Path of destination album like /2001/12-29/
 * @returns Map of new image paths to new version IDs
 */
export async function copyOriginals(oldAlbumPath: string, newAlbumPath: string): Promise<Map<string, string>> {
    console.info(`Copying original images from album [${oldAlbumPath}] to [${newAlbumPath}]...`);
    if (!isValidAlbumPath(oldAlbumPath)) throw new Error(`Invalid old album path [${oldAlbumPath}]`);
    if (!isValidAlbumPath(newAlbumPath)) throw new Error(`Invalid new album path [${newAlbumPath}]`);

    // Build list of images to copy
    const imagesToCopy: { oldImagePath: string; newImagePath: string }[] = [];
    const s3List = await listOriginalImages(oldAlbumPath);
    if (s3List.Contents) {
        for (const oldItem of s3List?.Contents) {
            if (!oldItem.Key) throw new Error(`No S3 key for image [${oldItem}]`);
            const oldImagePath = fromS3OriginalBucketKeyToPath(oldItem.Key);
            if (isValidAlbumPath(oldImagePath)) {
                console.info(`S3 listed album [${oldImagePath}] as an object, skipping from delete`);
                break;
            }
            if (!isValidImagePath(oldImagePath)) {
                throw new Error(`S3 listed invalid image path [${oldImagePath}]`);
            }
            const imageName = getNameFromPath(oldImagePath);
            if (!imageName) throw new Error(`No image name found in path [${oldImagePath}]`);
            const newImagePath = newAlbumPath + imageName;
            imagesToCopy.push({ oldImagePath, newImagePath });
        }
    }
    // Do the copy
    const newVersionIds: Map<string, string> = new Map();
    if (imagesToCopy.length === 0) {
        console.info(`No S3 objects to copy from [${oldAlbumPath}] to [${newAlbumPath}]`);
    } else {
        console.info(`Copying ${imagesToCopy.length} S3 objects from [${oldAlbumPath}] to [${newAlbumPath}]...`);
        // The right way to copy a "folder" of images appears to be to
        // iterate over all the objects and copy them individually.
        // AWS *does* have a batch job thing, but it's for large scale, millions of objects.
        // But it's weird because I can bulk DELETE, why the inconsistency?
        await Promise.all(imagesToCopy.map((image) => cpOrig(image.oldImagePath, image.newImagePath, newVersionIds)));
        console.info(`Copied ${imagesToCopy.length} S3 objects from [${oldAlbumPath}] to [${newAlbumPath}]`);
    }
    return newVersionIds;
}

/** Do the S3 copy and stick new version ID in the map */
async function cpOrig(oldImagePath: string, newImagePath: string, newVersionIds: Map<string, string>): Promise<void> {
    const versionId = await copyOriginal(oldImagePath, newImagePath);
    newVersionIds.set(newImagePath, versionId);
}

/**
 * Duplicate image from one path to another in S3 originals bucket.
 * Leaves old image intact.
 *
 * @param newImagePath path of source image like /2001/12-31/image.jpg
 * @param oldImagePath path of destination image like /2001/12-31/new_name.jpg
 * @returns VersionId of new image
 */
export async function copyOriginal(oldImagePath: string, newImagePath: string): Promise<string> {
    console.info(`Copying original image from [${oldImagePath}] to [${newImagePath}]...`);
    if (!isValidImagePath(oldImagePath)) throw new Error(`Cannot copy, invalid source image path [${oldImagePath}]`);
    if (!isValidImagePath(newImagePath)) throw new Error(`Cannot copy, invalid target image path [${newImagePath}]`);
    const copyCommand = new CopyObjectCommand({
        CopySource: `${getOriginalImagesBucketName()}${oldImagePath}`,
        Bucket: getOriginalImagesBucketName(), // Destination bucket
        Key: fromPathToS3OriginalBucketKey(newImagePath), // Destination key
    });
    const client = new S3Client({});
    const response = await client.send(copyCommand);
    if (!response.VersionId)
        throw new Error(`No version ID returned from S3 copy from [${oldImagePath}] to [${newImagePath}]`);
    return response.VersionId;
}
