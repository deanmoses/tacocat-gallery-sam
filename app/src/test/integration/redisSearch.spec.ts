import { searchRedis } from '../../lib/redis_utils/searchRedis';

it('search', async () => {
    const results = await searchRedis({ terms: 'soccer', itemType: 'image', startDate: new Date('2000-01-01') });
    console.log(`Total results: ${results.total}\n`, results.items);
});
