import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getDerivedImagesBucketName, getOriginalImagesBucketName } from '../lambda_utils/Env';
import { fromPathToS3OriginalBucketKey, getDerivedAssetPrefix, getDerivedAssetVersionPrefix } from './s3path';
import { isValidAlbumPath, isValidMediaPath } from '../gallery_path_utils/galleryPathUtils';
import { s3Client } from './s3Client';

/**
 * For an entire album, delete all the media from S3, both originals and any derived files.
 *
 * Does not touch DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
export async function deleteOriginalsAndDerivativesForAlbum(albumPath: string): Promise<void> {
    await Promise.allSettled([deleteOriginalsForAlbum(albumPath), deleteDerivedFilesForAlbum(albumPath)]);
}

/**
 * For a single media item, delete from S3 both the original and any derived files.
 *
 * Does not touch DynamoDB.
 *
 * @param mediaPath Path of media, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
export async function deleteOriginalAndDerivativesForMediaItem(mediaPath: string): Promise<void> {
    await Promise.allSettled([deleteOriginalMedia(mediaPath), deleteDerivedFilesByPath(mediaPath)]);
}

/**
 * For an entire album, delete from S3 all the original media.
 *
 * Does not touch DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function deleteOriginalsForAlbum(albumPath: string): Promise<void> {
    console.info({ event: 's3_album_originals_delete_started', albumPath });
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
    console.info({ event: 's3_album_derived_delete_started', albumPath });
    if (!isValidAlbumPath(albumPath)) {
        throw new Error(`Cannot delete derived files; invalid album path [${albumPath}]`);
    }
    const derivedFilesPrefix = getDerivedAssetPrefix(albumPath);
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
    console.info({ event: 's3_media_original_delete_started', mediaPath });
    if (!isValidMediaPath(mediaPath)) {
        throw new Error(`Cannot delete original media; invalid media path [${mediaPath}]`);
    }
    const originalMediaObjectKey = fromPathToS3OriginalBucketKey(mediaPath);
    const s3Command = new DeleteObjectCommand({
        Bucket: getOriginalImagesBucketName(),
        Key: originalMediaObjectKey,
    });
    await s3Client.send(s3Command);
}

/**
 * For a single media item, delete from S3 any derived assets, such as thumbs,
 * resized images, transcoded videos, and video posters.
 *
 * Does not touch DynamoDB.
 *
 * @param mediaPath the gallery item's path, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
async function deleteDerivedFilesByPath(mediaPath: string): Promise<void> {
    console.info({ event: 's3_media_derived_delete_started', mediaPath });
    if (!isValidMediaPath(mediaPath)) {
        throw new Error(`Cannot delete derived files; invalid media path [${mediaPath}]`);
    }
    const derivedFilesPath = getDerivedAssetPrefix(mediaPath);
    await deleteS3Folder(getDerivedImagesBucketName(), derivedFilesPath);
}

/**
 * Delete a specific version's derived assets from S3.
 * Used for cleaning up partial transcode outputs on failure.
 *
 * Does not touch DynamoDB.
 *
 * @param mediaPath the gallery item's path, like /2001/12-31/video.mp4
 * @param versionId the S3 version ID of the original media
 */
export async function deleteDerivedFilesByPathAndVersion(mediaPath: string, versionId: string): Promise<void> {
    if (!isValidMediaPath(mediaPath)) {
        throw new Error(`Cannot delete derived files; invalid media path [${mediaPath}]`);
    }
    const prefix = getDerivedAssetVersionPrefix(mediaPath, versionId);
    console.info({ event: 's3_version_derived_delete_started', prefix });
    await deleteS3Folder(getDerivedImagesBucketName(), prefix);
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
    // TODO: handle pagination if the folder contains more than 1000 objects
    // See https://github.com/deanmoses/tacocat-gallery-sam/issues/122

    // List the objects
    const s3Command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: keyPrefix, // the 'folder'
    });
    const objectsToDelete = await s3Client.send(s3Command);

    // Do a bulk delete of the objects
    if (objectsToDelete?.KeyCount) {
        console.info({
            event: 's3_folder_delete_started',
            bucket: bucketName,
            keyPrefix,
            count: objectsToDelete?.Contents?.length,
        });
        const deleteCommand = new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
                Objects: objectsToDelete.Contents?.map((obj) => ({ Key: obj.Key })), // array of keys to be deleted
                Quiet: false, // provide info on successful deletes
            },
        });

        const deletedObjects = await s3Client.send(deleteCommand);
        console.info({
            event: 's3_folder_deleted',
            bucket: bucketName,
            keyPrefix,
            count: deletedObjects?.Deleted?.length,
        });
        if (deletedObjects?.Errors) {
            deletedObjects.Errors.forEach((error) =>
                console.error({ event: 'derived_file_delete_failed', key: error.Key, code: error.Code }),
            );
        }

        return deletedObjects.Deleted?.length || 0;
    }
    return 0;
}
