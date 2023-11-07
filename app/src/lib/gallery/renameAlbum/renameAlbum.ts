import {
    S3Client,
    ListObjectsV2Command,
    CopyObjectCommand,
    NoSuchKey,
    ListObjectsV2CommandOutput,
} from '@aws-sdk/client-s3';
import { DynamoDBClient, ExecuteStatementCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
    isValidAlbumPath,
    isValidDayAlbumName,
    isValidImageNameStrict,
    isValidImagePath,
    isValidYearAlbumPath,
} from '../../gallery_path_utils/pathValidator';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName, getOriginalImagesBucketName } from '../../lambda_utils/Env';
import { ServerException } from '../../lambda_utils/ServerException';
import { getParentFromPath } from '../../gallery_path_utils/getParentFromPath';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { itemExists } from '../itemExists/itemExists';
import { deleteOriginalImageAndDerivativesFromS3 } from '../deleteImage/deleteImage';
import { getNameFromPath } from '../../gallery_path_utils/getNameFromPath';

/**
 * Rename a day album in both DynamoDB and S3.
 *
 * Only supports renaming within the same year album.
 *
 * @param oldAlbumPath Path of existing day album like /2001/12-31/
 * @param newName New name of album like 12-29
 * @returns Path of new album like /2001/12-29/
 */
export async function renameAlbum(oldAlbumPath: string, newName: string): Promise<string> {
    console.info(`Rename Album: renaming [${oldAlbumPath}] to [${newName}]...`);

    if (!isValidAlbumPath(oldAlbumPath)) {
        throw new BadRequestException(`Existing album path is invalid: [${oldAlbumPath}]`);
    }
    if (isValidYearAlbumPath(oldAlbumPath)) {
        throw new BadRequestException(`Cannot rename year albums`);
    }
    if ('/' === oldAlbumPath) {
        throw new BadRequestException(`Cannot rename root album`);
    }
    if (!isValidDayAlbumName(newName)) {
        throw new BadRequestException(`New name for album is invalid: [${newName}]`);
    }
    const newAlbumPath = getParentFromPath(oldAlbumPath) + newName + '/';
    if (!isValidAlbumPath(newAlbumPath)) {
        throw new BadRequestException(`New album path is invalid: [${newAlbumPath}]`);
    }
    if (newAlbumPath === oldAlbumPath) {
        throw new BadRequestException(`New album [${newAlbumPath}] cannot be same as old [${oldAlbumPath}]`);
    }
    if (!(await itemExists(oldAlbumPath))) {
        throw new BadRequestException(`Album not found: [${oldAlbumPath}]`);
    }
    if (await itemExists(newAlbumPath)) {
        throw new BadRequestException(`An album already exists at [${newAlbumPath}]`);
    }

    await copyImagesToNewNameInS3(oldAlbumPath, newAlbumPath);
    await renameInDynamoDB(oldAlbumPath, newAlbumPath);
    await deleteOldImagesFromS3(oldAlbumPath);

    console.info(`Rename Album: renamed [${oldAlbumPath}] to [${newAlbumPath}]`);
    return newAlbumPath;
}

/**
 * Copy album's images to new path in S3.
 *
 * @param oldAlbumPath Path of old album like /2001/12-31/
 * @param newAlbumPath Path of new album like /2001/12-29/
 */
async function copyImagesToNewNameInS3(oldAlbumPath: string, newAlbumPath: string): Promise<void> {
    // I'm pretty sure the right way to do this is to just iterate over all
    // the objects and copy them.  AWS *does* have a batch job thing,
    // but it's for large scale, millions of objects.

    const list = await listOriginalImagesInAlbum(oldAlbumPath);
    list.Contents?.forEach(async (oldItem) => {
        if (!oldItem.Key) throw new Error(`Blank key`);
        const imageName = getNameFromPath('/' + oldItem.Key);
        const newImagePath = newAlbumPath + imageName;
        const newItemKey = newImagePath.substring(1); // remove the starting '/' from path
        await copyOriginalImage(oldItem.Key, newItemKey);
    });
}

async function listOriginalImagesInAlbum(albumPath: string): Promise<ListObjectsV2CommandOutput> {
    const listCommand = new ListObjectsV2Command({
        Bucket: getOriginalImagesBucketName(), // Destination bucket
        Prefix: albumPath,
    });
    const client = new S3Client({});
    return await client.send(listCommand);
}

async function copyOriginalImage(oldKey: string, newKey: string): Promise<void> {
    console.info(`Rename Album: copying original image from [${oldKey}] to [${newKey}]`);
    const copyCommand = new CopyObjectCommand({
        CopySource: `${getOriginalImagesBucketName()}/${oldKey}`,
        Bucket: getOriginalImagesBucketName(), // Destination bucket
        Key: newKey, // Destination key
    });
    const client = new S3Client({});
    await client.send(copyCommand);
}

/**
 * Rename album and child images in DynamoDB.
 *
 * @param oldAlbumPath Path of old album like /2001/12-31/
 * @param newAlbumPath Path of new album like /2001/12-29/
 */
async function renameInDynamoDB(oldAlbumPath: string, newAlbumPath: string): Promise<void> {
    // In a single transaction
    //   - Update album path
    // 	 - Update image paths
    // - If album has a thumbnail, update thumbnail path
    // - If year album has a thumbnail, possibly update thumbnail path
    console.error(`TODO: implement renameInDynamoDB()`);
}

/**
 * Delete album's images from old path in S3.
 *
 * @param oldAlbumPath Path of old album like /2001/12-31/
 */
async function deleteOldImagesFromS3(oldAlbumPath: string): Promise<void> {
    console.error(`TODO: implement deleteOldImagesFromS3()`);
}
