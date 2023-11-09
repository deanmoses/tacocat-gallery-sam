import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getDerivedImagesBucketName, getOriginalImagesBucketName } from '../lambda_utils/Env';
import { fromPathToS3DerivedImagesBucketKey, fromPathToS3OriginalBucketKey } from './s3path';
import { isValidAlbumPath, isValidImagePath } from '../gallery_path_utils/galleryPathUtils';

/**
 * Delete album's images from S3, both original and any derived images.
 * Does not touch DynamoDB.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
export async function deleteOriginalsAndDerivatives(imagePath: string): Promise<void> {
    await deleteOriginals(imagePath);
    await deleteDerivedImagesForAlbum(imagePath);
}

/**
 * Delete image from S3, both original and any derived images.
 * Does not touch DynamoDB.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
export async function deleteOriginalAndDerivatives(imagePath: string): Promise<void> {
    await deleteOriginalImage(imagePath);
    await deleteDerivedImages(imagePath);
}

/**
 * Delete album's original images from S3.
 * Does not touch DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function deleteOriginals(albumPath: string): Promise<void> {
    console.info(`Deleting original images for album [${albumPath}]...`);
    if (!isValidAlbumPath(albumPath)) {
        throw new Error(`Cannot delete original images; invalid album path [${albumPath}]`);
    }
    const albumKeyPrefix = fromPathToS3OriginalBucketKey(albumPath);
    await deleteS3Folder(getOriginalImagesBucketName(), albumKeyPrefix);
}

/**
 * Delete album's derived images from S3.
 * Does not touch DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function deleteDerivedImagesForAlbum(albumPath: string): Promise<void> {
    console.info(`Deleting derived images for album [${albumPath}]...`);
    if (!isValidAlbumPath(albumPath)) {
        throw new Error(`Cannot delete derived images; invalid album path [${albumPath}]`);
    }
    const derivedImagesPrefix = fromPathToS3DerivedImagesBucketKey(albumPath);
    await deleteS3Folder(getDerivedImagesBucketName(), derivedImagesPrefix);
}

/**
 * Delete original image from S3.
 * Does not touch DynamoDB.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
async function deleteOriginalImage(imagePath: string): Promise<void> {
    console.info(`Deleting original image from S3 [${imagePath}]...`);
    if (!isValidImagePath(imagePath)) {
        throw new Error(`Cannot delete original image; invalid image path [${imagePath}]`);
    }
    const originalImageObjectKey = fromPathToS3OriginalBucketKey(imagePath);
    const s3Command = new DeleteObjectCommand({
        Bucket: getOriginalImagesBucketName(),
        Key: originalImageObjectKey,
    });
    const client = new S3Client({});
    await client.send(s3Command);
}

/**
 * Delete derived images from S3.
 * Does not touch DynamoDB.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
async function deleteDerivedImages(imagePath: string): Promise<void> {
    console.info(`Deleting derived images from S3 [${imagePath}]...`);
    if (!isValidImagePath(imagePath)) {
        throw new Error(`Cannot delete derived images; invalid image path [${imagePath}]`);
    }
    const derivedImagesPath = fromPathToS3DerivedImagesBucketKey(imagePath);
    await deleteS3Folder(getDerivedImagesBucketName(), derivedImagesPath);
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
        console.info(`Deleting [${objectsToDelete?.Contents?.length}] derived images...`);
        const deleteCommand = new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
                Objects: objectsToDelete.Contents?.map((obj) => ({ Key: obj.Key })), // array of keys to be deleted
                Quiet: false, // provide info on successful deletes
            },
        });

        const deletedObjects = await client.send(deleteCommand);
        console.info(`Deleted [${deletedObjects?.Deleted?.length}] derived images.`);
        if (deletedObjects?.Errors) {
            deletedObjects.Errors.map((error) => console.error(`${error.Key} could not be deleted - ${error.Code}`));
        }

        return deletedObjects.Deleted?.length || 0;
    }
    return 0;
}
