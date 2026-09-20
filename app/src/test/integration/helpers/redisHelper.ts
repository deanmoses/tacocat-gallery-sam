import { createRedisSearchClient } from '../../../lib/redis_utils/redisClientUtils';
import { waitFor } from './waitFor';

async function redisItemExists(path: string): Promise<boolean> {
    const client = await createRedisSearchClient();
    try {
        const result = await client.json.get(path);
        return result !== null;
    } finally {
        await client.close();
    }
}

/** Wait for the DynamoDB stream to sync the item into Redis */
export async function assertRedisItemExists(path: string, timeoutMs = 10000): Promise<void> {
    await waitFor(() => redisItemExists(path), { description: `Redis item [${path}] to exist`, timeoutMs });
}

/** Wait for the DynamoDB stream to remove the item from Redis */
export async function assertRedisItemDoesNotExist(path: string, timeoutMs = 10000): Promise<void> {
    await waitFor(async () => !(await redisItemExists(path)), {
        description: `Redis item [${path}] to not exist`,
        timeoutMs,
    });
}
