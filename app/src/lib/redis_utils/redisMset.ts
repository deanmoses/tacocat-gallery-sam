import { RedisGalleryItem } from './redisTypes';
import { RedisClient } from './redisClientUtils';
import { isValidImagePath } from '../gallery_path_utils/galleryPathUtils';

/**
 * Save the items to Redis.
 * Update existing / add new.
 */
export async function saveToRedis(redisClient: RedisClient, items: RedisGalleryItem[]): Promise<void> {
    if (!items.length) throw new Error(`No items to save`);
    const msetItems = items.map((item) => {
        return { key: toPath(item), path: '$', value: item };
    });
    await redisClient.json.mSet(msetItems);
}

function toPath(item: RedisGalleryItem): string {
    if (!item.parentPath) throw new Error(`Missing parentPath for ${item}`);
    if (!item.itemName) throw new Error(`Missing itemName for ${item}`);
    const path = `${item.parentPath}${item.itemName}`;
    return isValidImagePath(path) ? path : path + '/';
}
