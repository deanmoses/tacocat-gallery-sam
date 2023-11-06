import { S3Client, CopyObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import { DynamoDBClient, ExecuteStatementCommand, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { isValidImageNameStrict, isValidImagePath } from '../../gallery_path_utils/pathValidator';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName, getOriginalImagesBucketName } from '../../lambda_utils/Env';
import { ServerException } from '../../lambda_utils/ServerException';
import { getParentFromPath } from '../../gallery_path_utils/getParentFromPath';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { itemExists } from '../itemExists/itemExists';
import { deleteOriginalImageAndDerivativesFromS3 } from '../deleteImage/deleteImage';
import { getNameFromPath } from '../../gallery_path_utils/getNameFromPath';

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
    if (!isValidImagePath(oldImagePath)) {
        throw new BadRequestException(`Existing image path is invalid: [${oldImagePath}]`);
    }
    validateNewImageName(oldImagePath, newName);
    const newImagePath = getParentFromPath(oldImagePath) + newName;
    if (!(await itemExists(oldImagePath))) {
        throw new BadRequestException(`Image not found: [${oldImagePath}]`);
    }
    if (await itemExists(newImagePath)) {
        throw new BadRequestException(`An image already exists at [${newImagePath}]`);
    }
    await copyImageToNewNameInS3(oldImagePath, newImagePath);
    await renameImageInDynamoDB(oldImagePath, newName);
    await deleteOriginalImageAndDerivativesFromS3(oldImagePath);
    console.info(`Rename Image: renamed image from [${oldImagePath}] to [${newImagePath}]`);
    return newImagePath;
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
 * Copy image to new location in S3.
 * Leaves original at the old location.
 * Does not touch DynamoDB.
 *
 * @param existingImagePath Path of existing image like /2001/12-31/existingImage.jpg
 * @param newImagePath Path of new image like /2001/12-31/newImage.jpg
 */
async function copyImageToNewNameInS3(existingImagePath: string, newImagePath: string) {
    console.info(`Rename Image: copying original image in S3 from [${existingImagePath}] to [${newImagePath}]...`);

    // remove initial '/' from paths
    const existingImageObjectKey = existingImagePath.substring(1);
    const newlImageObjectKey = newImagePath.substring(1);

    const s3Command = new CopyObjectCommand({
        CopySource: `${getOriginalImagesBucketName()}/${existingImageObjectKey}`,
        Bucket: getOriginalImagesBucketName(), // Destination bucket
        Key: newlImageObjectKey, // Destination key
    });

    const client = new S3Client({});
    try {
        await client.send(s3Command);
    } catch (e) {
        if (e instanceof NoSuchKey) {
            throw new ServerException(
                `Unexpected state: image [${existingImagePath}] exists in database but not on filesystem.`,
            );
        }
        console.error(`Error copying S3 object [${existingImageObjectKey}] to [${newlImageObjectKey}]`);
        throw e;
    }
}

/**
 * Rename the image in DynamoDB.
 * Renames any usages of the image as an album thumbnail as well.
 * Does not touch S3.
 *
 * @param oldImagePath Old image path like /2001/12-31/image.jpg
 * @param newImageName New image name like new_image_name.jpg
 */
async function renameImageInDynamoDB(oldImagePath: string, newImageName: string) {
    // TODO: these should all be done in a single transaction.
    // However, since updating the album thumbnail entries rely on a
    // a condition failing, the transaction would fail.  BZZZT.
    await moveImageInDynamoDB(oldImagePath, newImageName);
    const albumPath = getParentFromPath(oldImagePath);
    await renameAlbumThumb(oldImagePath, newImageName, albumPath);
    const grandparentAlbumPath = getParentFromPath(albumPath);
    await renameAlbumThumb(oldImagePath, newImageName, grandparentAlbumPath);
}

/**
 * Rename specified entry in DynamoDB.
 * Does not update any usages of the image as an album thumbnail (unfortunately)
 * Does not touch S3.
 *
 * @param oldPath Path of existing image like /2001/12-31/image.jpg
 * @param newName New name of image like newName.jpg
 * @param entry Image entry retrieved from DynamoDB
 */
async function moveImageInDynamoDB(oldPath: string, newName: string) {
    console.info(`Rename Image: renaming image entry in DynamoDB from [${oldPath}] to [${newName}]...`);
    const oldPathParts = getParentAndNameFromPath(oldPath);
    const imageEntry = await getOriginalImageFromDynamoDB(oldPath);
    imageEntry['itemName'] = newName;
    imageEntry['updatedOn'] = new Date().toISOString();
    const ddbCommand = new TransactWriteCommand({
        TransactItems: [
            // Create new entry
            {
                Put: {
                    TableName: getDynamoDbTableName(),
                    Item: imageEntry,
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
 * Get the full contents of the original image from DynamoDB
 */
async function getOriginalImageFromDynamoDB(path: string): Promise<Record<string, unknown>> {
    const pathParts = getParentAndNameFromPath(path);
    const ddbCommand = new GetCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
    });

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        const response = await docClient.send(ddbCommand);
        if (!response?.Item) {
            throw new ServerException(`Unexpected state: image [${path}] no longer exists in DynamoDB.`);
        }
        return response.Item;
    } catch (e) {
        console.error(`Error attempting to retrieve original image [${path}] from DynamoDB: `, e);
        throw e;
    }
}

/**
 * If renamed image is being used as the thumbnail of the specified album,
 * rename the album's thumbnail entry.
 *
 * @param oldImagePath Path of old image like /2001/12-31/image.jpg
 * @param newImageName New name of image like new_name.jpg
 * @param albumPath Path of album like /2001/12-31/ or /2001/
 */
async function renameAlbumThumb(oldImagePath: string, newImageName: string, albumPath: string): Promise<void> {
    console.info(
        `Rename Image: attempting to rename thumnail of [${albumPath}] from [${oldImagePath}] to [${newImageName}]...`,
    );
    const albumPathParts = getParentAndNameFromPath(albumPath);
    const newImagePath = getParentFromPath(oldImagePath) + newImageName;
    const ddbCommand = new ExecuteStatementCommand({
        Statement:
            `UPDATE "${getDynamoDbTableName()}"` +
            // TODO: set thumbnail.fileUpdatedOn !!!
            ` SET thumbnail.path='${newImagePath}'` +
            ` SET updatedOn='${new Date().toISOString()}'` +
            ` WHERE parentPath='${albumPathParts.parent}' AND itemName='${albumPathParts.name}' AND thumbnail.path='${oldImagePath}'`,
    });
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        await docClient.send(ddbCommand);
        console.info(`Rename Image: album [${albumPath}]: renamed image [${newImagePath}] as its thumbnail`);
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            console.info(`Rename Image: album [${albumPath}] did not have image [${oldImagePath}] as its thumbnail`);
        } else {
            throw e;
        }
    }
}
