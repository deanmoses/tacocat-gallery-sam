import { BatchGetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AlbumItem, GalleryItem, Rectangle } from '../gallery/galleryTypes';
import { getParentAndNameFromPath, toImagePath } from '../gallery_path_utils/galleryPathUtils';
import { getDynamoDbTableName } from '../lambda_utils/Env';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

/**
 * Augment each album's thumbnail entry with info from the image record
 * in DynamoDB, such as the image's versionId and crop info.
 * Ignores any image entries in the galleryItems array.
 */
export async function augmentAlbumThumbnailsWithImageInfo(galleryItems: GalleryItem[]): Promise<void> {
    if (!galleryItems || galleryItems.length === 0) return;
    const Keys: { parentPath: string; itemName: string }[] = [];
    for (const galleryItem of galleryItems) {
        if ('image' === galleryItem.itemType) continue;
        const album = galleryItem as AlbumItem;
        if (album.thumbnail?.path) {
            const pathParts = getParentAndNameFromPath(album.thumbnail?.path);
            if (pathParts.name) {
                Keys.push({
                    parentPath: pathParts.parent,
                    itemName: pathParts.name,
                });
            }
        }
    }
    if (Keys.length === 0) return;
    const ddbCommand = new BatchGetCommand({
        RequestItems: {
            [getDynamoDbTableName()]: {
                Keys,
                ProjectionExpression: 'parentPath, itemName, thumbnail, versionId',
            },
        },
    });
    const ddbClient = new DynamoDBClient();
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const result = await docClient.send(ddbCommand);
    const imgInfos = new Map<
        string,
        { parentPath?: string; itemName?: string; thumbnail?: Rectangle; versionId?: string }
    >();
    result.Responses?.[getDynamoDbTableName()]?.forEach((item) => {
        const imagePath = toImagePath(item.parentPath, item.itemName);
        imgInfos.set(imagePath, item);
    });
    for (const galleryItem of galleryItems) {
        if ('image' === galleryItem.itemType) continue;
        const album = galleryItem as AlbumItem;
        if (album.thumbnail?.path) {
            const imgInfo = imgInfos.get(album.thumbnail.path);
            if (!imgInfo)
                throw new Error(
                    `Album [${album.path}]: failed to get thumbnail info for image [${album.thumbnail.path}]`,
                );
            if (!imgInfo.versionId) throw new Error(`Missing versionId for image [${album.thumbnail.path}]`);
            album.thumbnail.versionId = imgInfo.versionId;
            if (imgInfo.thumbnail) {
                album.thumbnail.crop = imgInfo.thumbnail;
            }
        }
    }
}
