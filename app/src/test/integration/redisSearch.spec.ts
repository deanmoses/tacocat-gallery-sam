import { search } from '../../lib/gallery/search/search';
import { initRedis } from '../../lib/gallery/syncRedis/syncRedis';
import { createRedisWriteClient, type RedisClient } from '../../lib/redis_utils/redisClientUtils';

describe('Redis search', () => {
    let redisClient: RedisClient;

    beforeAll(async () => {
        redisClient = await createRedisWriteClient();
        await initRedis({ redisClient });
    });

    afterAll(async () => {
        await redisClient?.quit();
    });

    it('returns empty results for nonexistent term', async () => {
        const results = await search({ terms: 'xx7jNNp', newestYear: '2099', startAt: '0', pageSize: '3' });
        expect(results.total).toBe(0);
        expect(results.items).toHaveLength(0);
    });
});
