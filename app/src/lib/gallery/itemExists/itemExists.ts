import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
    getParentAndNameFromPath,
    getParentFromPath,
    isValidAlbumPath,
    isValidMediaPath,
} from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { getItem } from '../../dynamo_utils/ddbGet';
import { AlbumItem } from '../galleryTypes';

/**
 * Return true if the specified album exists in DynamoDB.
 */
export async function albumExists(albumPath: string, includeUnpublishedAlbums: boolean = false): Promise<boolean> {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Invalid album path [${albumPath}]`);
    }
    if (albumPath === '/') {
        throw new BadRequestException('Invalid path: root album does not exist in database');
    }
    const album = await getItem<AlbumItem>(albumPath, ['published']);
    if (!album) return false;
    if (!includeUnpublishedAlbums) {
        return album.published == true;
    }
    return true;
}

/**
 * Return true if the specified media (image or video) exists in DynamoDB.
 */
export async function mediaExists(mediaPath: string, includeUnpublishedAlbums: boolean = false): Promise<boolean> {
    if (!isValidMediaPath(mediaPath)) {
        throw new BadRequestException(`Invalid media path [${mediaPath}]`);
    }
    // TODO: this could be optimized by retrieving both the album and the media in one query
    // but that'd entail owning a lot more code.  Another way to speed it up would be to
    // parallelize the two queries via Promise.allSettled()
    if (!includeUnpublishedAlbums) {
        const albumPath = getParentFromPath(mediaPath);
        const parentAlbumExists = await albumExists(albumPath, includeUnpublishedAlbums);
        if (!parentAlbumExists) return false;
    }
    return await itemExists(mediaPath);
}

/**
 * Return true if the specified album or image exists in DynamoDB.
 * Doesn't respect album published status; simply checks if there's a record in the database.
 *
 * @param path path of the album or image, like /2001/12-31/ or /2001/12-31/image.jpg
 */
export async function itemExists(path: string): Promise<boolean> {
    if (!isValidAlbumPath(path) && !isValidMediaPath(path)) {
        throw new BadRequestException(`Malformed path: [${path}]`);
    }

    if (path === '/') {
        throw new BadRequestException('Malformed path: root album does not exist in database');
    }

    const pathParts = getParentAndNameFromPath(path);
    const ddbCommand = new GetCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
        ProjectionExpression: 'parentPath,published', // Must get at least one field or else it returns ALL fields
    });

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        const response = await docClient.send(ddbCommand);
        return !!response?.Item;
    } catch (e) {
        console.error(`Error attempting to retrieve item [${path}]: `, e);
        throw e;
    }
}
