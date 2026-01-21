import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getDerivedImagesBucketName, getOriginalImagesBucketName } from '../lambda_utils/Env';
import { fromPathToS3DerivedImagesBucketKey, fromPathToS3OriginalBucketKey, getDerivedAssetIdPrefix } from './s3path';
import { isValidAlbumPath, isValidMediaPath } from '../gallery_path_utils/galleryPathUtils';
import { isValidUuid } from '../uuid_utils/uuidUtils';

/**
 * For an entire album, delete all the media from S3, both originals and any derived files.
 *
 * Does not touch DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 * @param mediaIds Optional list of media IDs (for deleting transcoded videos and posters) - do NOT pass this for album renames; IDs survive renames
 */
export async function deleteOriginalsAndDerivativesForAlbum(albumPath: string, mediaIds?: string[]): Promise<void> {
    const deletePromises: Promise<void>[] = [deleteOriginalsForAlbum(albumPath), deleteDerivedFilesForAlbum(albumPath)];
    if (mediaIds) {
        for (const videoId of mediaIds) {
            deletePromises.push(deleteDerivedFilesById(videoId));
        }
    }
    await Promise.allSettled(deletePromises);
}

/**
 * For a single media item, delete from S3 both the original and any derived files.
 *
 * For videos, also pass the UUID to delete the transcoded video and poster.
 *
 * Does not touch DynamoDB.
 *
 * @param mediaPath Path of media, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 * @param mediaId Optional DynamoDB ID of media item (for deleting transcoded video and poster) - do NOT pass this for album renames; IDs survive renames
 */
export async function deleteOriginalAndDerivativesForMediaItem(mediaPath: string, mediaId?: string): Promise<void> {
    const deletePromises = [deleteOriginalMedia(mediaPath), deleteDerivedFilesByPath(mediaPath)];
    if (mediaId) {
        deletePromises.push(deleteDerivedFilesById(mediaId));
    }
    await Promise.allSettled(deletePromises);
}

/**
 * For an entire album, delete from S3 all the original media.
 *
 * Does not touch DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function deleteOriginalsForAlbum(albumPath: string): Promise<void> {
    console.info(`Deleting original media for album [${albumPath}]...`);
    if (!isValidAlbumPath(albumPath)) {
        throw new Error(`Cannot delete original media; invalid album path [${albumPath}]`);
    }
    const albumKeyPrefix = fromPathToS3OriginalBucketKey(albumPath);
    await deleteS3Folder(getOriginalImagesBucketName(), albumKeyPrefix);
}

/**
 * For an entire album, delete from S3 all the derived assets, including
 * thumbnails, resized images, transcoded videos, video poster images).
 *
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
 * For a single media item, delete from S3 the original media file.
 *
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
 * For a single media item, delete from S3 any derived assets, such as thumbs
 * and resized images, that have been stored by media path.
 *
 * This only deletes files stored by path; to delete files stored by ID,
 * use {@link deleteDerivedFilesById}.
 *
 * Does not touch DynamoDB.
 *
 * @param mediaPath the gallery item's path, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
async function deleteDerivedFilesByPath(mediaPath: string): Promise<void> {
    console.info(`Deleting derived files from S3 [${mediaPath}]...`);
    if (!isValidMediaPath(mediaPath)) {
        throw new Error(`Cannot delete derived files; invalid media path [${mediaPath}]`);
    }
    const derivedFilesPath = fromPathToS3DerivedImagesBucketKey(mediaPath);
    await deleteS3Folder(getDerivedImagesBucketName(), derivedFilesPath);
}

/**
 * Delete from S3 any derived assets, such as transcoded videos and posters
 * that have been stored by media ID.
 *
 * This only deletes files stored by ID; to delete files stored by path,
 * use {@link deleteDerivedFilesByPath}.
 *
 * Does not touch DynamoDB.
 *
 * @param mediaId the gallery item's DynamoDB ID
 */
async function deleteDerivedFilesById(mediaId: string): Promise<void> {
    if (!isValidUuid(mediaId)) {
        throw new Error(`Cannot delete assets; invalid UUID [${mediaId}]`);
    }
    console.info(`Deleting assets for ID [${mediaId}]...`);
    await deleteS3Folder(getDerivedImagesBucketName(), getDerivedAssetIdPrefix(mediaId));
}

/**
 * Delete every S3 object under a certain "folder".
 *
 * S3 doesn't actually have folders; instead, this lists all the objects that
 * start with the given path and does a bulk delete on them.
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
