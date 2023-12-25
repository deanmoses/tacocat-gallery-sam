import { AlbumItem, GalleryItem, GalleryItemType, ImageItem } from '../../lib/gallery/galleryTypes';
import { pathToDate } from '../../lib/gallery_path_utils/galleryPathUtils';
import { RedisAlbumItem, RedisGalleryItem, RedisImageItem } from '../../lib/redis_utils/redisTypes';

/**
 * Convert from an AWS gallery item to a Redis gallery item
 */
export function toRedisItem(awsItem: GalleryItem): RedisGalleryItem {
    if (!awsItem.parentPath) throw new Error(`Missing parentPath for ${awsItem}`);
    if (!awsItem.itemName) throw new Error(`Missing itemName for ${awsItem}`);
    if (!awsItem.itemType) throw new Error(`Missing itemType for ${awsItem}`);
    switch (awsItem.itemType) {
        case 'image':
            return toRedisImage(awsItem as ImageItem);
        case 'album':
            return toRedisAlbum(awsItem as AlbumItem);
        default:
            throw new Error(`Unrecognized itemType: [${awsItem.itemType}]`);
    }
}

function toRedisImage(awsImageItem: ImageItem): RedisImageItem {
    const path = toPath(awsImageItem);
    if (!awsImageItem.versionId) throw new Error(`Missing versionId for ${path}`);
    if (!awsImageItem.dimensions) throw new Error(`Missing dimensions for ${path}`);
    const redisImageItem: RedisImageItem = {
        parentPath: getParentPath(awsImageItem.parentPath),
        itemName: getItemName(awsImageItem.itemName),
        itemNameSearchable: toSearchableItemName(getItemName(awsImageItem.itemName)),
        itemType: getItemType(awsImageItem.itemType),
        albumDate: toTimestampFromPath(path),
        versionId: awsImageItem.versionId,
        dimensions: awsImageItem.dimensions,
    };
    if (awsImageItem.title) redisImageItem.title = awsImageItem.title;
    if (awsImageItem.description) redisImageItem.description = awsImageItem.description;
    if (awsImageItem.tags) redisImageItem.tags = awsImageItem.tags;
    return redisImageItem;
}

function toRedisAlbum(awsAlbumItem: AlbumItem): RedisAlbumItem {
    const path = toPath(awsAlbumItem);
    if (!awsAlbumItem.thumbnail) throw new Error(`[${path}]: missing thumbnail`);
    if (!awsAlbumItem.published) throw new Error(`[${path}]: missing published`);
    const redisAlbumItem: RedisAlbumItem = {
        parentPath: getParentPath(awsAlbumItem.parentPath),
        itemName: getItemName(awsAlbumItem.itemName),
        itemType: getItemType(awsAlbumItem.itemType),
        albumDate: toTimestampFromPath(path),
        published: awsAlbumItem.published,
        thumbnail: awsAlbumItem.thumbnail,
    };
    if (awsAlbumItem.description) redisAlbumItem.description = awsAlbumItem.description;
    if (awsAlbumItem.summary) redisAlbumItem.summary = awsAlbumItem.summary;
    return redisAlbumItem;
}

function getParentPath(parentPath: string | undefined): string {
    if (!parentPath) throw new Error(`Missing parentPath`);
    return parentPath;
}

function getItemName(itemName: string | undefined): string {
    if (!itemName) throw new Error(`Missing itemName`);
    return itemName;
}

function getItemType(itemType: GalleryItemType | undefined): GalleryItemType {
    if (!itemType) throw new Error(`Missing itemType`);
    return itemType;
}

export function toPath(item: GalleryItem): string {
    const path = getParentPath(item.parentPath) + getItemName(item.itemName);
    return item.itemType === 'image' ? path : path + '/';
}

/** Unix timestamp in seconds not millis */
export function toTimestampFromPath(path: string): number {
    return pathToDate(path).getTime();
}

/**
 * Redis won't find 'pat' in an itemName like 'pat1.jpg',
 * so this is the searchable version of the filename
 */
export function toSearchableItemName(itemName: string): string {
    return itemName.toLowerCase().replace(/[^a-z]/g, ' ');
}
