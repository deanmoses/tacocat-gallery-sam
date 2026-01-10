import { createRedisSearchClient } from '../../../lib/redis_utils/redisClientUtils';

/** Check if an item exists in Redis */
async function redisItemExists(path: string): Promise<boolean> {
    const client = await createRedisSearchClient();
    try {
        const result = await client.json.get(path);
        return result !== null;
    } finally {
        await client.quit();
    }
}

/**
 * Assert that an item exists in Redis, polling until it appears or timeout
 * @param path The gallery path to check
 * @param timeoutMs Maximum time to wait
 * @param pollIntervalMs Time between checks
 */
export async function assertRedisItemExists(path: string, timeoutMs = 10000, pollIntervalMs = 500): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await redisItemExists(path)) return;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for Redis item [${path}] to exist`);
}

/**
 * Assert that an item does not exist in Redis, polling until it disappears or timeout
 * @param path The gallery path to check
 * @param timeoutMs Maximum time to wait
 * @param pollIntervalMs Time between checks
 */
export async function assertRedisItemDoesNotExist(
    path: string,
    timeoutMs = 10000,
    pollIntervalMs = 500,
): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (!(await redisItemExists(path))) return;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(`Timed out after ${timeoutMs}ms waiting for Redis item [${path}] to not exist`);
}
