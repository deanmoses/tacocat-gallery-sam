import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { isValidAlbumPath, isValidImagePath } from '../../gallery_path_utils/pathValidator';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { setImageAsAlbumThumb } from './setImageAsAlbumThumb';

/**
 * Set specified album's thumbnail to the specified image.
 */
export async function setAlbumThumbnail(albumPath: string, imagePath: string) {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Invalid album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Cannot update root album');
    }

    if (!isValidImagePath(imagePath)) {
        throw new BadRequestException(`Invalid image path: [${imagePath}]`);
    }

    // Get image
    const imageResult = await getImage(imagePath);
    const image = imageResult.Item;
    const imageNotFound = image === undefined;
    if (imageNotFound) throw new BadRequestException('Image not found: ' + imagePath);

    const thumbnailUpdatedOn = image.thumbnail ? image.thumbnail.fileUpdatedOn : image.fileUpdatedOn;

    // TODO: this fails silently if the image or album doesn't exist
    // Instead, it should throw an exception
    await setImageAsAlbumThumb(albumPath, imagePath, thumbnailUpdatedOn, true /* replaceExistingThumb */);
}

/**
 * Return the specified image from DynamoDB
 *
 * @param imagePath Path of the image to retrieve, like /2001/12-31/image.jpg
 */
async function getImage(imagePath: string) {
    const pathParts = getParentAndNameFromPath(imagePath);
    const dynamoParams = {
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
        ProjectionExpression: 'fileUpdatedOn,thumbnail',
    };
    return await dynamoClient.send(dynamoParams);
}
