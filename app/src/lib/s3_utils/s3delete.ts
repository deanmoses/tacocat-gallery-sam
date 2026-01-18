import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getDerivedImagesBucketName, getOriginalImagesBucketName } from '../lambda_utils/Env';
import { fromPathToS3DerivedImagesBucketKey, fromPathToS3OriginalBucketKey } from './s3path';
import { isValidAlbumPath, isValidMediaPath } from '../gallery_path_utils/galleryPathUtils';
import { isValidUuid } from '../uuid_utils/uuidUtils';

/**
 * Delete album's media from S3, both originals and any derived files.
 * Does not touch DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
export async function deleteOriginalsAndDerivatives(albumPath: string): Promise<void> {
    await Promise.allSettled([deleteOriginals(albumPath), deleteDerivedFilesForAlbum(albumPath)]);
}

/**
 * Delete single media from S3, both original and any derived files.
 * Does not touch DynamoDB.
 *
 * For videos, also pass the UUID to delete the transcoded video and poster from /video/<UUID>.
 *
 * @param mediaPath Path of media, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 * @param videoUuid Optional UUID for video assets (transcoded video and poster)
 */
export async function deleteOriginalAndDerivatives(mediaPath: string, videoUuid?: string): Promise<void> {
    const deletePromises = [deleteOriginalMedia(mediaPath), deleteDerivedFiles(mediaPath)];
    if (videoUuid) {
        deletePromises.push(deleteVideoAssets(videoUuid));
    }
    await Promise.allSettled(deletePromises);
}

/**
 * Delete album's original media from S3.
 * Does not touch DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function deleteOriginals(albumPath: string): Promise<void> {
    console.info(`Deleting original media for album [${albumPath}]...`);
    if (!isValidAlbumPath(albumPath)) {
        throw new Error(`Cannot delete original media; invalid album path [${albumPath}]`);
    }
    const albumKeyPrefix = fromPathToS3OriginalBucketKey(albumPath);
    await deleteS3Folder(getOriginalImagesBucketName(), albumKeyPrefix);
}

/**
 * Delete album's derived files from S3 (thumbnails, resized images).
 * Does not touch DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function deleteDerivedFilesForAlbum(albumPath: string): Promise<void> {
    console.info(`Deleting derived files for album [${albumPath}]...`);
    if (!isValidAlbumPath(albumPath)) {
        throw new Error(`Cannot delete derived files; invalid album path [${albumPath}]`);
    }
    const derivedFilesPrefix = fromPathToS3DerivedImagesBucketKey(albumPath);
    await deleteS3Folder(getDerivedImagesBucketName(), derivedFilesPrefix);
}

/**
 * Delete original media from S3.
 * Does not touch DynamoDB.
 *
 * @param mediaPath Path of media, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
async function deleteOriginalMedia(mediaPath: string): Promise<void> {
    console.info(`Deleting original media from S3 [${mediaPath}]...`);
    if (!isValidMediaPath(mediaPath)) {
        throw new Error(`Cannot delete original media; invalid media path [${mediaPath}]`);
    }
    const originalMediaObjectKey = fromPathToS3OriginalBucketKey(mediaPath);
    const s3Command = new DeleteObjectCommand({
        Bucket: getOriginalImagesBucketName(),
        Key: originalMediaObjectKey,
    });
    const client = new S3Client({});
    await client.send(s3Command);
}

/**
 * Delete derived files from S3 (thumbnails and resized images).
 * Does not touch DynamoDB.
 *
 * @param mediaPath Path of media, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
async function deleteDerivedFiles(mediaPath: string): Promise<void> {
    console.info(`Deleting derived files from S3 [${mediaPath}]...`);
    if (!isValidMediaPath(mediaPath)) {
        throw new Error(`Cannot delete derived files; invalid media path [${mediaPath}]`);
    }
    const derivedFilesPath = fromPathToS3DerivedImagesBucketKey(mediaPath);
    await deleteS3Folder(getDerivedImagesBucketName(), derivedFilesPath);
}

/**
 * Delete video assets (transcoded video and poster) from S3.
 * Video assets are stored at /video/<UUID>.mp4 and /video/<UUID>.jpg in the Derived bucket.
 * Does not touch DynamoDB.
 *
 * @param uuid UUID of the video
 */
async function deleteVideoAssets(uuid: string): Promise<void> {
    if (!isValidUuid(uuid)) {
        throw new Error(`Cannot delete video assets; invalid UUID [${uuid}]`);
    }
    console.info(`Deleting video assets for UUID [${uuid}]...`);
    // Delete all files with prefix video/<UUID> (includes .mp4 and .jpg)
    await deleteS3Folder(getDerivedImagesBucketName(), `video/${uuid}`);
}

/**
 * Delete every S3 object under a certain "folder".
 * S3 doesn't actually have folders; instead, this lists
 * all the objects that start with the given path and
 * does a bulk delete on them.
 *
 * @param bucketName name of S3 bucket
 * @param keyPrefix the start of a S3 object key.  This will delete all objects whose keys start with this key.
 * @returns number of objects deleted
 */
async function deleteS3Folder(bucketName: string, keyPrefix: string): Promise<number> {
    // List the objects
    const s3Command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: keyPrefix, // the 'folder'
    });
    const client = new S3Client({});
    const objectsToDelete = await client.send(s3Command);

    // Do a bulk delete of the objects
    if (objectsToDelete?.KeyCount) {
        console.info(`Deleting [${objectsToDelete?.Contents?.length}] derived files...`);
        const deleteCommand = new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
                Objects: objectsToDelete.Contents?.map((obj) => ({ Key: obj.Key })), // array of keys to be deleted
                Quiet: false, // provide info on successful deletes
            },
        });

        const deletedObjects = await client.send(deleteCommand);
        console.info(`Deleted [${deletedObjects?.Deleted?.length}] derived files.`);
        if (deletedObjects?.Errors) {
            deletedObjects.Errors.map((error) => console.error(`${error.Key} could not be deleted - ${error.Code}`));
        }

        return deletedObjects.Deleted?.length || 0;
    }
    return 0;
}
