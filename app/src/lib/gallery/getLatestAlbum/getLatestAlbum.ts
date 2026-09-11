import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { AlbumThumbnail, ImageItem } from '../galleryTypes';
import { toAlbumPath } from '../../gallery_path_utils/galleryPathUtils';
import { getItem } from '../../dynamo_utils/ddbGet';
import { ddbDocClient } from '../../dynamo_utils/ddbClient';

/**
 * Retrieve the latest album in the gallery
 */
export async function getLatestAlbum(): Promise<AlbumThumbnail | undefined> {
    const currentYearAlbumPath = `/${new Date().getUTCFullYear()}/`;
    return await getLatestAlbumInAlbum(currentYearAlbumPath);
}

/**
 * Retrieve the latest album in the specified parent album from DynamoDB.
 *
 * @param path Path of parent album like /2001/
 */
async function getLatestAlbumInAlbum(path: string): Promise<AlbumThumbnail | undefined> {
    // find the most recent album within the current year
    const ddbCommand = new QueryCommand({
        TableName: getDynamoDbTableName(),
        KeyConditionExpression: 'parentPath = :parentPath',
        FilterExpression: 'itemType = :itemType and published = :published',
        ExpressionAttributeValues: {
            ':parentPath': path,
            ':itemType': 'album',
            ':published': true,
        },
        ProjectionExpression: 'itemName,parentPath,itemType,updatedOn,summary,thumbnail',
        ScanIndexForward: false, // sort results in descending order, i.e., newest first
    });
    // The DynamoDB document client returns `Record<string, any>`; the query
    // filters on itemType 'album', so the rows are albums.
    const album = (await ddbDocClient.send(ddbCommand))?.Items?.[0] as AlbumThumbnail | undefined;
    if (album) {
        album.path = toAlbumPath(album.parentPath, album.itemName);
        if (album.thumbnail?.path) {
            const image = await getItem<ImageItem>(album.thumbnail.path, ['thumbnail', 'versionId']);
            if (image) {
                album.thumbnail.versionId = image?.versionId;
                if (image.thumbnail) {
                    album.thumbnail.crop = image.thumbnail;
                }
            }
        }
    }
    return album;
}
