import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { AlbumThumbnail, ImageItem } from '../galleryTypes';
import { toPathFromItem } from '../../gallery_path_utils/galleryPathUtils';
import { getItem } from '../../dynamo_utils/ddbGet';

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
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const album = (await docClient.send(ddbCommand))?.Items?.[0];
    if (album) {
        album.path = toPathFromItem(album);
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
