import { createClient } from 'redis';
import { RedisGalleryItem } from '../../lib/redis_utils/redisTypes';
import { getRedisConnectionString } from '../../lib/redis_utils/redisClientUtils';
import { isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';

/** Save the items to Redis.  Update existing / add new. */
export async function saveToRedis(items: RedisGalleryItem[]): Promise<void> {
    const client = await createClient({ url: getRedisConnectionString() })
        .on('error', (err) => console.log('Redis Client Error', err))
        .connect();
    try {
        await client.json.mSet(
            items.map((item) => {
                return { key: toPath(item), path: '$', value: item };
            }),
        );
    } finally {
        await client.quit();
    }
}

function toPath(item: RedisGalleryItem): string {
    if (!item.parentPath) throw new Error(`Missing parentPath for ${item}`);
    if (!item.itemName) throw new Error(`Missing itemName for ${item}`);
    const path = `${item.parentPath}/${item.itemName}`;
    return path + isValidImagePath(path) ? '' : '/';
}
