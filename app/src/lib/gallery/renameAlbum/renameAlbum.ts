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
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { getParentFromPath } from '../../gallery_path_utils/getParentFromPath';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { itemExists } from '../itemExists/itemExists';
import { getNameFromPath } from '../../gallery_path_utils/getNameFromPath';
import { copyOriginals } from '../../s3_utils/s3copy';
import { deleteOriginalsAndDerivatives } from '../../s3_utils/s3delete';

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

    await copyOriginals(oldAlbumPath, newAlbumPath);
    await renameInDynamoDB(oldAlbumPath, newAlbumPath);
    await deleteOriginalsAndDerivatives(oldAlbumPath);

    console.info(`Rename Album: renamed [${oldAlbumPath}] to [${newAlbumPath}]`);
    return newAlbumPath;
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
