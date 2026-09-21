import type { RedisClient } from '../../../lib/redis_utils/redisClientUtils';
import { createRedisSearchClient } from '../../../lib/redis_utils/redisClientUtils';
import { waitFor } from './waitFor';

let client: Promise<RedisClient> | undefined;

/** One connection per suite; the integration setup file closes it in afterAll */
function redis(): Promise<RedisClient> {
    client ??= createRedisSearchClient();
    return client;
}

export async function closeRedis(): Promise<void> {
    if (!client) return;
    const c = await client;
    client = undefined;
    await c.close();
}

async function redisItemExists(path: string): Promise<boolean> {
    return (await (await redis()).json.get(path)) !== null;
}

/** Wait for the DynamoDB stream to sync the item into Redis */
export async function waitForRedisItem(path: string): Promise<void> {
    await waitFor(() => redisItemExists(path), { description: `Redis item [${path}] to exist` });
}

/** Wait for the DynamoDB stream to remove the item from Redis */
export async function waitForRedisItemGone(path: string): Promise<void> {
    await waitFor(async () => !(await redisItemExists(path)), { description: `Redis item [${path}] to be gone` });
}
