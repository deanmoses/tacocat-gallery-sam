import { createClient } from 'redis';
import { createRedisSearchClient, createRedisWriteClient } from './redisClientUtils';

jest.mock('redis');

const mockCreateClient = jest.mocked(createClient);
const connect = jest.fn();

/** The connection URL the last client was created with */
function lastUrl(): string {
    const [options] = mockCreateClient.mock.calls[0] as [{ url: string }];
    return options.url;
}

beforeEach(() => {
    connect.mockReset();
    mockCreateClient.mockReturnValue({ connect } as unknown as ReturnType<typeof createClient>);
    process.env.REDIS_HOST = 'redis.example.com:12345';
    process.env.REDIS_WRITE_USERNAME = 'writer';
    process.env.REDIS_WRITE_PASSWORD = 'w#pass/word';
    process.env.REDIS_SEARCH_USERNAME = 'searcher';
    process.env.REDIS_SEARCH_PASSWORD = 's@pass:word';
});

describe('createRedisSearchClient()', () => {
    it('connects with the search credentials, URL-encoded', async () => {
        const client = {};
        connect.mockResolvedValue(client);

        await expect(createRedisSearchClient()).resolves.toBe(client);
        expect(lastUrl()).toBe('redis://searcher:s%40pass%3Aword@redis.example.com:12345');
        expect(connect).toHaveBeenCalledTimes(1);
    });
});

describe('createRedisWriteClient()', () => {
    it('connects with the write credentials, URL-encoded', async () => {
        const client = {};
        connect.mockResolvedValue(client);

        await expect(createRedisWriteClient()).resolves.toBe(client);
        expect(lastUrl()).toBe('redis://writer:w%23pass%2Fword@redis.example.com:12345');
    });

    it('fails without a host rather than connecting somewhere else', async () => {
        delete process.env.REDIS_HOST;

        await expect(createRedisWriteClient()).rejects.toThrow(/REDIS_HOST/);
        expect(mockCreateClient).not.toHaveBeenCalled();
    });
});
