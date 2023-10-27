import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';

/**
 * Sets specified album's thumbnail to the specified image.
 *
 * @returns success message
 */
export async function setAlbumThumbnail(tableName: string, albumPath: string, imagePath: string) {
    if (!tableName) throw 'No DynamoDB table defined';

    if (!albumPath) {
        throw new BadRequestException('No album specified');
    }

    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Cannot update root album');
    }

    if (!imagePath) {
        throw new BadRequestException('Missing imagePath');
    }

    // TODO: extract this as a lib method
    assertWellFormedImagePath(imagePath);

    // Ensure only these attributes are in the input
    const validKeys = new Set(['imagePath']);
    const keysToUpdate = Object.keys(body);
    keysToUpdate.forEach((keyToUpdate) => {
        // Ensure we aren't trying to update an unknown attribute
        if (!validKeys.has(keyToUpdate)) {
            throw new BadRequestException('Unknown attribute: ' + keyToUpdate);
        }
    });

    // Get image
    const imageResult = await getImage(ctx, imagePath);
    const image = imageResult.Item;
    const imageNotFound = image === undefined;
    if (imageNotFound) throw new BadRequestException('Image not found: ' + imagePath);

    const thumbnailUpdatedOn = image.thumbnail ? image.thumbnail.fileUpdatedOn : image.fileUpdatedOn;

    // TODO: this fails silently if the image or album doesn't exist
    // Instead, it should throw an exception
    await setImageAsAlbumThumb(ctx, albumPath, imagePath, thumbnailUpdatedOn, true /* replaceExistingThumb */);
}

/**
 * Throw exception if it's not a well-formed album path
 */
function assertWellFormedAlbumPath(albumPath) {
    if (!albumPath.match(/^\/(\d\d\d\d\/(\d\d-\d\d\/)?)?$/)) {
        throw new BadRequestException("Malformed album path: '" + albumPath + "'");
    }
}

/**
 * Throw exception if it's not a well-formed image path
 */
function assertWellFormedImagePath(imagePath) {
    if (!imagePath.match(/^\/\d\d\d\d\/\d\d-\d\d\/.*\..*$/)) {
        throw new BadRequestException("Malformed image path: '" + imagePath + "'");
    }
}

/**
 * Return the specified image from DynamoDB
 *
 * @param {Object} ctx the environmental context needed to do the work
 * @param {*} imagePath Path of the image to retrieve, like /2001/12-31/image.jpg
 */
async function getImage(ctx, imagePath) {
    const pathParts = getParentAndNameFromPath(imagePath);
    const dynamoParams = {
        TableName: ctx.tableName,
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
        ProjectionExpression: 'fileUpdatedOn,thumbnail',
    };
    return await ctx.doGetImage(dynamoParams);
}
