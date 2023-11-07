import { ConditionalCheckFailedException, DynamoDBClient, ExecuteStatementCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { isValidImagePath } from '../../gallery_path_utils/pathValidator';
import { getParentFromPath } from '../../gallery_path_utils/getParentFromPath';
import { deleteOriginalAndDerivatives } from '../../s3_utils/s3delete';

/**
 * Delete specified image from both DynamoDB and S3.
 *
 * @param imagePath Path of image to delete, like /2001/12-31/image.jpg
 */
export async function deleteImage(imagePath: string) {
    console.info(`Delete Image: deleting image [${imagePath}]...`);
    await deleteImageFromDynamoDB(imagePath);
    await removeImageAsThumbnailFromParentAlbums(imagePath);
    await deleteOriginalAndDerivatives(imagePath);
    console.info(`Delete Image: deleted image [${imagePath}]`);
}

/**
 * Delete specified image from Dynamo DB.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
async function deleteImageFromDynamoDB(imagePath: string) {
    console.info(`Delete Image: deleting from DynamoDB [${imagePath}]...`);

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
 * If image is used as the thumbnail of its parent or grandparent album, remove it.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 */
async function removeImageAsThumbnailFromParentAlbums(imagePath: string) {
    console.info(`Delete Image: removing image as any album thumbnail [${imagePath}]...`);

    const parentAlbumPath = getParentFromPath(imagePath);
    await removeImageAsAlbumThumbnail(imagePath, parentAlbumPath);

    const grandparentAlbumPath = getParentFromPath(parentAlbumPath);
    await removeImageAsAlbumThumbnail(imagePath, grandparentAlbumPath);
}

/**
 * If image is used as the thumbnail of the specified album, remove it.
 *
 * @param imagePath Path of image, like /2001/12-31/image.jpg
 * @param albumPath Path of album, like /2001/12-31/
 */
async function removeImageAsAlbumThumbnail(imagePath: string, albumPath: string) {
    const albumPathParts = getParentAndNameFromPath(albumPath);
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
        console.info(`Delete Image: album [${albumPath}]: removed image [${imagePath}] as its thumbnail`);
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            console.info(`Delete Image: album [${albumPath}] did not have image [${imagePath}] as its thumbnail`);
        } else {
            throw e;
        }
    }
}
