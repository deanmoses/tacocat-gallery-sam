import { createRedisWriteClient } from '../../lib/redis_utils/redisClientUtils';

test('mset', async () => {
    const redisClient = await createRedisWriteClient();
    try {
        redisClient.json.mSet([
            { key: 'key1', path: '$', value: { a: 1 } },
            { key: 'key2', path: '$', value: { a: 2 } },
            { key: 'key3', path: '$', value: { a: 3 } },
            { key: 'key4', path: '$', value: { a: 4 } },
        ]);
    } finally {
        await redisClient.quit();
    }
});
