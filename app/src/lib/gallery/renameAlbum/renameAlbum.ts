import { DynamoDBClient, ExecuteStatementCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
    getParentAndNameFromPath,
    getParentFromPath,
    isValidAlbumPath,
    isValidDayAlbumName,
    isValidYearAlbumPath,
    toPath,
} from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { itemExists } from '../itemExists/itemExists';
import { copyOriginals } from '../../s3_utils/s3copy';
import { deleteOriginalsAndDerivatives } from '../../s3_utils/s3delete';
import { getFullChildrenFromDynamoDB, getFullItemFromDynamoDB, getItem } from '../../dynamo_utils/ddbGet';

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
    const newAlbumPath = toPath(getParentFromPath(oldAlbumPath), newName);
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
    await moveAlbumInDynamoDB(oldAlbumPath, newAlbumPath); // handles renaming thumbnail on parent album
    await renameAlbumThumb(getParentFromPath(oldAlbumPath), oldAlbumPath, newAlbumPath); // rename thumb on grandparent album
    await deleteOriginalsAndDerivatives(oldAlbumPath);

    console.info(`Rename Album: renamed [${oldAlbumPath}] to [${newAlbumPath}]`);
    return newAlbumPath;
}

/**
 * Rename specified album and its children in DynamoDB.
 * Does not update the thumbnails that should be changed in any other albums.
 * Does not touch S3.
 *
 * @param oldAlbumPath Path of existing image like /2001/12-31/image.jpg
 * @param newAlbumPath New name of image like newName.jpg
 * @param entry Image entry retrieved from DynamoDB
 */
async function moveAlbumInDynamoDB(oldAlbumPath: string, newAlbumPath: string): Promise<void> {
    console.info(
        `Rename Album: moving album and image entries in DynamoDB from [${oldAlbumPath}] to [${newAlbumPath}]...`,
    );
    const oldAlbumPathParts = getParentAndNameFromPath(oldAlbumPath);
    const newAlbumPathParts = getParentAndNameFromPath(newAlbumPath);
    const now = new Date().toISOString();

    const album = await getFullItemFromDynamoDB(oldAlbumPath);
    if (!album) throw new Error(`Old album [${oldAlbumPath}] not found in DynamoDB`);
    album.parentPath = newAlbumPathParts.parent;
    album.itemName = newAlbumPathParts.name;
    album.updatedOn = now;
    if (!!album?.thumbnail?.path) {
        album.thumbnail.path = album.thumbnail.path.replace(oldAlbumPath, newAlbumPath);
    }

    const ddbCommand = new TransactWriteCommand({
        TransactItems: [
            // Create new album entry
            {
                Put: {
                    TableName: getDynamoDbTableName(),
                    Item: album,
                },
            },
            // Delete old album entry
            {
                Delete: {
                    TableName: getDynamoDbTableName(),
                    Key: {
                        parentPath: oldAlbumPathParts.parent,
                        itemName: oldAlbumPathParts.name,
                    },
                },
            },
        ],
    });

    const children = await getFullChildrenFromDynamoDB(oldAlbumPath);
    if (!!children) {
        children.forEach((child) => {
            child.parentPath = newAlbumPath;
            child.updatedOn = now;
            ddbCommand.input.TransactItems?.push(
                // Create new image entry
                {
                    Put: {
                        TableName: getDynamoDbTableName(),
                        Item: child,
                    },
                },
                // Delete old image entry
                {
                    Delete: {
                        TableName: getDynamoDbTableName(),
                        Key: {
                            parentPath: oldAlbumPath,
                            itemName: child.itemName,
                        },
                    },
                },
            );
        });
    }

    console.log(`transaction: `, JSON.stringify(ddbCommand.input.TransactItems, null, 2));

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    await docClient.send(ddbCommand);
}

/**
 * If specified album has a thumb within the specified old path,
 * update it to the new path.
 *
 * @param albumPath Path of album on which to change the thumbnail, like /2001/ or /2001/12-31/
 * @param oldPathOfAlbumWithThumb Old path of album containing thumbnail like /2001/12-31/
 * @param newPathOfAlbumWithThumb New path of album containing thumbnail like /2001/12-29/
 */
export async function renameAlbumThumb(
    albumPath: string,
    oldPathOfAlbumWithThumb: string,
    newPathOfAlbumWithThumb: string,
): Promise<void> {
    console.info(
        `Maybe updating [${albumPath}]'s thumb path from [${oldPathOfAlbumWithThumb}] to [${newPathOfAlbumWithThumb}]...`,
    );
    if (!isValidAlbumPath(albumPath)) throw new Error(`Invalid album path: [${albumPath}]`);
    if (!isValidAlbumPath(oldPathOfAlbumWithThumb)) throw new Error(`Invalid old path: [${oldPathOfAlbumWithThumb}]`);
    if (!isValidAlbumPath(newPathOfAlbumWithThumb)) throw new Error(`Invalid new path: [${newPathOfAlbumWithThumb}]`);

    const album = await getItem(albumPath, ['thumbnail']);
    if (album?.thumbnail?.path?.includes(oldPathOfAlbumWithThumb)) {
        const oldImagePath = album.thumbnail.path;
        const newImagePath = oldImagePath.replace(oldPathOfAlbumWithThumb, newPathOfAlbumWithThumb);
        const albumPathParts = getParentAndNameFromPath(albumPath);
        const ddbCommand = new ExecuteStatementCommand({
            Statement:
                `UPDATE "${getDynamoDbTableName()}"` +
                ` SET thumbnail.path='${newImagePath}'` +
                ` SET updatedOn='${new Date().toISOString()}'` +
                ` WHERE parentPath='${albumPathParts.parent}' AND itemName='${albumPathParts.name}'`,
        });
        const ddbClient = new DynamoDBClient({});
        const docClient = DynamoDBDocumentClient.from(ddbClient);
        await docClient.send(ddbCommand);
        console.info(`Renamed album [${albumPath}] thumb from [${oldImagePath}] to [${newImagePath}]`);
    } else {
        console.info(`Album [${albumPath}] did not have an image within [${oldPathOfAlbumWithThumb}] as its thumbnail`);
    }
}
