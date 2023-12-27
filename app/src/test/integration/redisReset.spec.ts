import { resetAndReloadRedis } from '../../lib/gallery/resetAndReloadRedis/resetAndReloadRedis';

test('reset', async () => {
    await expect(resetAndReloadRedis()).resolves.not.toThrow();
    console.log(`reset complete`);
});
