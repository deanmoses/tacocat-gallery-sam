import { createClient } from 'redis';
import { getRedisConnectionString } from '../../lib/redis_utils/redisClientUtils';

/** Delete the specified paths from Redis */
export async function deleteFromRedis(paths: string[]): Promise<void> {
    const client = await createClient({ url: getRedisConnectionString() })
        .on('error', (err) => console.log('Redis Client Error', err))
        .connect();
    try {
        await client.del(paths);
    } finally {
        await client.quit();
    }
}
