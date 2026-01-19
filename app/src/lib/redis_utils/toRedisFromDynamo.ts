import { AlbumItem, GalleryItem, GalleryItemType, ImageItem, VideoItem } from '../gallery/galleryTypes';
import { pathToDate } from '../gallery_path_utils/galleryPathUtils';
import { RedisAlbumItem, RedisGalleryItem, RedisImageItem, RedisVideoItem } from './redisTypes';

/**
 * Convert from an AWS gallery item to a Redis gallery item
 */
export function toRedisItem(awsItem: GalleryItem): RedisGalleryItem {
    if (!awsItem.parentPath) throw new Error(`Missing parentPath for ${awsItem}`);
    if (!awsItem.itemName) throw new Error(`Missing itemName for ${awsItem}`);
    if (!awsItem.itemType) throw new Error(`Missing itemType for ${awsItem}`);
    switch (awsItem.itemType) {
        case 'image':
            // Videos have itemType 'image' but also have mediaType 'video'
            if ('mediaType' in awsItem && awsItem.mediaType === 'video') {
                return toRedisVideo(awsItem as VideoItem);
            }
            return toRedisImage(awsItem as ImageItem);
        case 'album':
            return toRedisAlbum(awsItem as AlbumItem);
        default: {
            const exhaustiveCheck: never = awsItem;
            throw new Error(`Unrecognized itemType: [${(exhaustiveCheck as GalleryItem).itemType}]`);
        }
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
        // Auto-tag images with "photo", "image", "picture" for search filtering
        tags: ['photo', 'image', 'picture', ...(awsImageItem.tags || [])],
    };
    if (awsImageItem.title) redisImageItem.title = awsImageItem.title;
    if (awsImageItem.description) redisImageItem.description = awsImageItem.description;
    return redisImageItem;
}

function toRedisVideo(awsVideoItem: VideoItem): RedisVideoItem {
    const path = toPath(awsVideoItem);
    if (!awsVideoItem.id) throw new Error(`Missing id for ${path}`);
    if (!awsVideoItem.versionId) throw new Error(`Missing versionId for ${path}`);
    if (!awsVideoItem.dimensions) throw new Error(`Missing dimensions for ${path}`);
    if (awsVideoItem.duration == null) throw new Error(`Missing duration for ${path}`);
    const redisVideoItem: RedisVideoItem = {
        parentPath: getParentPath(awsVideoItem.parentPath),
        itemName: getItemName(awsVideoItem.itemName),
        itemNameSearchable: toSearchableItemName(getItemName(awsVideoItem.itemName)),
        itemType: getItemType(awsVideoItem.itemType),
        mediaType: 'video',
        albumDate: toTimestampFromPath(path),
        id: awsVideoItem.id,
        versionId: awsVideoItem.versionId,
        dimensions: awsVideoItem.dimensions,
        duration: awsVideoItem.duration,
        // Auto-tag videos with "movie", "video", "clip" for search filtering
        tags: ['movie', 'video', 'clip', ...(awsVideoItem.tags || [])],
    };
    if (awsVideoItem.title) redisVideoItem.title = awsVideoItem.title;
    if (awsVideoItem.description) redisVideoItem.description = awsVideoItem.description;
    return redisVideoItem;
}

function toRedisAlbum(awsAlbumItem: AlbumItem): RedisAlbumItem {
    const path = toPath(awsAlbumItem);
    const redisAlbumItem: RedisAlbumItem = {
        parentPath: getParentPath(awsAlbumItem.parentPath),
        itemName: getItemName(awsAlbumItem.itemName),
        itemType: getItemType(awsAlbumItem.itemType),
        albumDate: toTimestampFromPath(path),
        published: awsAlbumItem.published ?? false,
    };
    if (awsAlbumItem.thumbnail) redisAlbumItem.thumbnail = awsAlbumItem.thumbnail;
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
