import { ConditionalCheckFailedException, DynamoDBClient, ExecuteStatementCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDerivedImagesBucketName, getDynamoDbTableName, getOriginalImagesBucketName } from '../../lambda_utils/Env';
import { isValidImagePath } from '../../gallery_path_utils/pathValidator';

/**
 * Delete specified image from both DynamoDB and S3.
 *
 * @param imagePath Path of image to delete, like /2001/12-31/image.jpg
 */
export async function deleteImage(imagePath: string) {
    await deleteImageFromDynamoDB(imagePath);
    await removeImageAsAlbumThumbnail(imagePath);
    await deleteOriginalImageAndDerivativesFromS3(imagePath);
}

/**
 * Delete specified image from Dynamo DB.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
async function deleteImageFromDynamoDB(imagePath: string) {
    if (!isValidImagePath(imagePath)) {
        throw new BadRequestException(`Malformed image path: [${imagePath}]`);
    }

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    // TODO: block delete if the album contains child photos or child albums
    const tableName = getDynamoDbTableName();
    const pathParts = getParentAndNameFromPath(imagePath);
    const ddbCommand = new DeleteCommand({
        TableName: tableName,
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
    });
    await docClient.send(ddbCommand);
}

/**
 * If image is used as the thumbnail of its parent album,
 * remove it as the thumbnail.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
async function removeImageAsAlbumThumbnail(imagePath: string) {
    // TODO: also try to update grandparent album
    const imagePathParts = getParentAndNameFromPath(imagePath);
    const albumPathParts = getParentAndNameFromPath(imagePathParts.parent);
    const ddbCommand = new ExecuteStatementCommand({
        Statement:
            `UPDATE "${getDynamoDbTableName()}"` +
            ' REMOVE thumbnail' +
            ` SET updatedOn='${new Date().toISOString()}'` +
            ` WHERE parentPath='${albumPathParts.parent}' AND itemName='${albumPathParts.name}' AND thumbnail.path='${imagePath}'`,
    });
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        await docClient.send(ddbCommand);
        console.info(`Album [${imagePathParts.parent}]: removed image [${imagePath}] as its thumbnail`);
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            console.info(`Album [${imagePathParts.parent}] did not have image [${imagePath}] as its thumbnail`);
        } else {
            throw e;
        }
    }
}

/**
 * Delete image from S3, both original and any derived images.
 * Does not touch DynamoDB
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
export async function deleteOriginalImageAndDerivativesFromS3(imagePath: string) {
    await deleteOriginalImageFromS3(imagePath);
    await deleteDerivedImagesFromS3(imagePath);
}

/**
 * Delete original image from S3.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
async function deleteOriginalImageFromS3(imagePath: string) {
    // remove the starting '/' from path
    const originalImageObjectKey = imagePath.substring(1);
    const s3Command = new DeleteObjectCommand({
        Bucket: getOriginalImagesBucketName(),
        Key: originalImageObjectKey,
    });
    const client = new S3Client({});
    await client.send(s3Command);
}

/**
 * Delete derived images from S3.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
async function deleteDerivedImagesFromS3(imagePath: string) {
    // Delete everything under i/2001/01-01/image.jpg/
    const derivedImagesPath = 'i' + imagePath + '/';
    await deleteS3Folder(getDerivedImagesBucketName(), derivedImagesPath);
}

/**
 * Delete every S3 object under a certain "folder".
 * S3 doesn't actually have folders; instead, this lists
 * all the objects that start with the given path and
 * does a bulk delete on them.
 *
 * @param bucketName name of S3 bucket
 * @param folderPath the start of a S3 object key.  This will delete all objects whose keys start with this key.
 * @returns number of objects deleted
 */
async function deleteS3Folder(bucketName: string, folderPath: string): Promise<number> {
    // List the objects
    const s3Command = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: folderPath, // the 'folder'
    });
    const client = new S3Client({});
    const objectsToDelete = await client.send(s3Command);

    // Do a bulk delete of the objects
    if (objectsToDelete.KeyCount) {
        console.info(`Deleting [${objectsToDelete?.Contents?.length}] derived images...`);
        const deleteCommand = new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
                Objects: objectsToDelete.Contents?.map((obj) => ({ Key: obj.Key })), // array of keys to be deleted
                Quiet: false, // provides info on successful deletes
            },
        });

        const deletedObjects = await client.send(deleteCommand); // delete the files

        console.info(`Deleted [${deletedObjects?.Deleted?.length}] derived images.`);

        if (deletedObjects?.Errors) {
            deletedObjects.Errors.map((error) => console.error(`${error.Key} could not be deleted - ${error.Code}`));
        }

        return deletedObjects.Deleted?.length || 0;
    }
    return 0;
}
