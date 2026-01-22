import { S3Client, CopyObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getOriginalImagesBucketName, getDerivedImagesBucketName } from '../lambda_utils/Env';
import { listOriginalImages } from './s3list';
import { fromPathToS3OriginalBucketKey, fromS3OriginalBucketKeyToPath, getDerivedAssetVersionPrefix } from './s3path';
import { getNameFromPath, isValidAlbumPath, isValidMediaPath } from '../gallery_path_utils/galleryPathUtils';

/**
 * For an entire album, copy its media to new path in S3 originals bucket.
 * Leaves old media intact.
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
        for (const oldItem of s3List.Contents) {
            if (!oldItem.Key) throw new Error(`No S3 key for image [${oldItem}]`);
            const oldImagePath = fromS3OriginalBucketKeyToPath(oldItem.Key);
            if (isValidAlbumPath(oldImagePath)) {
                console.info(`S3 listed album [${oldImagePath}] as an object, skipping from delete`);
                break;
            }
            if (!isValidMediaPath(oldImagePath)) {
                throw new Error(`S3 listed invalid media path [${oldImagePath}]`);
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
 * For a single media item (image or video) copy it from one path to another in S3 originals bucket.
 * Leaves old media intact.
 *
 * @param oldMediaPath path of source media like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 * @param newMediaPath path of destination media like /2001/12-31/new_name.jpg
 * @returns VersionId of new media
 */
export async function copyOriginal(oldMediaPath: string, newMediaPath: string): Promise<string> {
    console.info(`Copying original media from [${oldMediaPath}] to [${newMediaPath}]...`);
    if (!isValidMediaPath(oldMediaPath)) throw new Error(`Cannot copy, invalid source media path [${oldMediaPath}]`);
    if (!isValidMediaPath(newMediaPath)) throw new Error(`Cannot copy, invalid target media path [${newMediaPath}]`);
    const copyCommand = new CopyObjectCommand({
        CopySource: `${getOriginalImagesBucketName()}${oldMediaPath}`,
        Bucket: getOriginalImagesBucketName(), // Destination bucket
        Key: fromPathToS3OriginalBucketKey(newMediaPath), // Destination key
    });
    const client = new S3Client({});
    const response = await client.send(copyCommand);
    if (!response.VersionId)
        throw new Error(`No version ID returned from S3 copy from [${oldMediaPath}] to [${newMediaPath}]`);
    return response.VersionId;
}

/**
 * For a single media item, copy all derived assets (thumbnails, video transcode,
 * poster) from old path to new path.
 *
 * Used when renaming media to preserve cached derived images.
 *
 * @param oldPath Gallery path of source media like /2001/12-31/image.jpg
 * @param newPath Gallery path of destination media like /2001/12-31/new_name.jpg
 * @param oldVersionId S3 version ID of the old media
 * @param newVersionId S3 version ID of the new media
 */
export async function copyDerivedAssets(
    oldPath: string,
    newPath: string,
    oldVersionId: string,
    newVersionId: string,
): Promise<void> {
    const derivedBucket = getDerivedImagesBucketName();
    const oldPrefix = getDerivedAssetVersionPrefix(oldPath, oldVersionId);
    const newPrefix = getDerivedAssetVersionPrefix(newPath, newVersionId);

    // List all objects with the old prefix
    const client = new S3Client({});
    const listResponse = await client.send(
        new ListObjectsV2Command({
            Bucket: derivedBucket,
            Prefix: oldPrefix,
        }),
    );

    const objects = listResponse.Contents || [];
    if (objects.length === 0) {
        console.info(JSON.stringify({ event: 'no_derived_assets_to_copy', oldPrefix }));
        return;
    }

    // Copy each object to the new prefix
    // Note: Object count is bounded (videos: 2 files, images: ~5 cached sizes max)
    await Promise.all(
        objects.map(async (obj) => {
            if (!obj.Key) return;
            const newKey = obj.Key.replace(oldPrefix, newPrefix);
            await client.send(
                new CopyObjectCommand({
                    Bucket: derivedBucket,
                    CopySource: `${derivedBucket}/${obj.Key}`,
                    Key: newKey,
                }),
            );
        }),
    );

    console.info(JSON.stringify({ event: 'derived_assets_copied', count: objects.length, oldPrefix, newPrefix }));
}
