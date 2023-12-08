import { DynamoDBClient, ExecuteStatementCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
    getNameFromPath,
    getParentAndNameFromPath,
    getParentFromPath,
    isValidAlbumPath,
    isValidImageNameStrict,
    isValidImagePath,
} from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { itemExists } from '../itemExists/itemExists';
import { copyOriginal } from '../../s3_utils/s3copy';
import { deleteOriginalAndDerivatives } from '../../s3_utils/s3delete';
import { getFullItemFromDynamoDB } from '../../dynamo_utils/ddbGet';
import { ImageItem } from '../galleryTypes';

/**
 * Rename an image in both DynamoDB and S3.
 *
 * Only supports renaming within the same album.
 * I COULD implement this as a move and allow moving to other albums,
 * but v1 of the UI won't support that.  I can build that support when
 * I need it in the UI.
 *
 * @param oldImagePath Path of existing image like /2001/12-31/image.jpg
 * @param newName New name of image like newName.jpg
 * @returns Path of new image like /2001/12-31/newName.jpg
 */
export async function renameImage(oldImagePath: string, newName: string): Promise<string> {
    console.info(`Rename Image: renaming [${oldImagePath}] to [${newName}]...`);
    assertIsValidImagePath(oldImagePath);
    validateNewImageName(oldImagePath, newName);
    const newImagePath = getParentFromPath(oldImagePath) + newName;
    await Promise.all([assertImageExists(oldImagePath), assertImageDoesNotExist(newImagePath)]);
    const newVersionId = await copyOriginal(oldImagePath, newImagePath);
    await renameImageInDynamoDB(oldImagePath, newName, newVersionId);
    await deleteOriginalAndDerivatives(oldImagePath);
    console.info(`Rename Image: renamed image from [${oldImagePath}] to [${newImagePath}]`);
    return newImagePath;
}

function assertIsValidImagePath(imagePath: string): void {
    if (!isValidImagePath(imagePath)) {
        throw new BadRequestException(`Invalid image path: [${imagePath}]`);
    }
}

async function assertImageExists(imagePath: string): Promise<void> {
    if (!(await itemExists(imagePath))) {
        throw new BadRequestException(`Image not found: [${imagePath}]`);
    }
}

async function assertImageDoesNotExist(imagePath: string): Promise<void> {
    if (await itemExists(imagePath)) {
        throw new BadRequestException(`An image already exists at [${imagePath}]`);
    }
}

/**
 * Verify that the new image name is valid.
 * Including that it's the same extension as the old image.
 *
 * @param existingImagePath Path of existing image like /2001/12-31/image.jpg
 * @param newName New name of image like newName.jpg
 */
function validateNewImageName(existingImagePath: string, newName: string) {
    if (!isValidImageNameStrict(newName)) {
        throw new BadRequestException(`New image name is invalid: [${newName}]`);
    }
    if (newName === getNameFromPath(existingImagePath)) {
        throw new BadRequestException(`New image name [${newName}] cannot be same as old one [${existingImagePath}]`);
    }
    const oldExtension = existingImagePath.split('.').pop();
    const newExtension = newName.split('.').pop();
    if (newExtension !== oldExtension) {
        throw new BadRequestException(`File extension of [${newName}] does not match [${existingImagePath}]`);
    }
}

/**
 * Rename the image in DynamoDB.
 * Renames any usages of the image as an album thumbnail as well.
 * Does not touch S3.
 *
 * @param oldImagePath Old image path like /2001/12-31/image.jpg
 * @param newImageName New image name like new_image_name.jpg
 * @param newVersionId Version ID of new image
 */
async function renameImageInDynamoDB(oldImagePath: string, newImageName: string, newVersionId: string) {
    const albumPath = getParentFromPath(oldImagePath);
    const newImagePath = albumPath + newImageName;
    const grandparentAlbumPath = getParentFromPath(albumPath);
    // TODO: these should all be done in a single transaction.
    // However, since updating the album thumbnail entries rely on a
    // a condition failing, the transaction would fail.  BZZZT.
    await Promise.all([
        moveImageInDynamoDB(oldImagePath, newImageName, newVersionId),
        renameAlbumThumb(albumPath, oldImagePath, newImagePath),
        renameAlbumThumb(grandparentAlbumPath, oldImagePath, newImagePath),
    ]);
}

/**
 * Rename specified entry in DynamoDB.
 * Does not update any usages of the image as an album thumbnail (unfortunately)
 * Does not touch S3.
 *
 * @param oldImagePath Path of existing image like /2001/12-31/image.jpg
 * @param newImageName New name of image like newName.jpg
 * @param newVersionId Version ID of new image
 */
async function moveImageInDynamoDB(oldImagePath: string, newImageName: string, newVersionId: string) {
    console.info(`Rename Image: renaming image entry in DynamoDB from [${oldImagePath}] to [${newImageName}]...`);
    const oldPathParts = getParentAndNameFromPath(oldImagePath);
    const image = await getFullItemFromDynamoDB<ImageItem>(oldImagePath);
    if (!image) throw new Error(`Old image [${oldImagePath}] not found in DynamoDB`);
    image.itemName = newImageName;
    image.updatedOn = new Date().toISOString();
    image.versionId = newVersionId;
    const ddbCommand = new TransactWriteCommand({
        TransactItems: [
            // Create new entry
            {
                Put: {
                    TableName: getDynamoDbTableName(),
                    Item: image,
                },
            },
            // Delete old entry
            {
                Delete: {
                    TableName: getDynamoDbTableName(),
                    Key: {
                        parentPath: oldPathParts.parent,
                        itemName: oldPathParts.name,
                    },
                },
            },
        ],
    });
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    await docClient.send(ddbCommand);
}

/**
 * If specified album is using the specified image as its thumbnail,
 * update it to the image's new path.
 *
 * @param albumPath Path of album like /2001/12-31/ or /2001/
 * @param oldImagePath Old path of image like /2001/12-31/image.jpg
 * @param newImagePath New path of image like /2001/12-31/new_name.jpg
 */
export async function renameAlbumThumb(albumPath: string, oldImagePath: string, newImagePath: string): Promise<void> {
    console.info(`Attempting to rename thumb of [${albumPath}] from [${oldImagePath}] to [${newImagePath}]...`);
    if (!isValidAlbumPath(albumPath)) throw new Error(`Invalid album path: [${albumPath}]`);
    if (!isValidImagePath(oldImagePath)) throw new Error(`Invalid album path: [${oldImagePath}]`);
    if (!isValidImagePath(newImagePath)) throw new Error(`Invalid album path: [${newImagePath}]`);
    const albumPathParts = getParentAndNameFromPath(albumPath);
    const ddbCommand = new ExecuteStatementCommand({
        Statement:
            `UPDATE "${getDynamoDbTableName()}"` +
            ` SET thumbnail.path='${newImagePath}'` +
            ` SET updatedOn='${new Date().toISOString()}'` +
            ` WHERE parentPath='${albumPathParts.parent}' AND itemName='${albumPathParts.name}' AND thumbnail.path='${oldImagePath}'`,
    });

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        await docClient.send(ddbCommand);
        console.info(`Album [${albumPath}]: renamed thumbnail from [${oldImagePath}] to [${newImagePath}]`);
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            console.info(`Album [${albumPath}] did not have image [${oldImagePath}] as its thumbnail`);
        } else {
            throw e;
        }
    }
}
