import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { syncRedis, initRedis, deepEqual, SyncResult, isSyncErrorResult } from './syncRedis';
import { ImageItem, AlbumItem } from '../galleryTypes';
import { RedisImageItem, RedisAlbumItem } from '../../redis_utils/redisTypes';
import { RedisClient } from '../../redis_utils/redisClientUtils';

const mockDocClient = mockClient(DynamoDBDocumentClient);

/** Minimal mock of the Redis client methods used by syncRedis */
interface MockRedisClient {
    json: {
        mGet: jest.Mock;
        mSet: jest.Mock;
    };
    ft: {
        info: jest.Mock;
        create: jest.Mock;
    };
    dbSize: jest.Mock;
    quit: jest.Mock;
}

const createMockRedisClient = (): MockRedisClient => ({
    json: {
        mGet: jest.fn(),
        mSet: jest.fn(),
    },
    ft: {
        info: jest.fn(),
        create: jest.fn(),
    },
    dbSize: jest.fn().mockResolvedValue(0),
    quit: jest.fn(),
});

beforeEach(() => {
    mockDocClient.reset();
    process.env.GALLERY_ITEM_DDB_TABLE = 'test-table';
});

describe('deepEqual', () => {
    test('equal primitives', () => {
        expect(deepEqual(1, 1)).toBe(true);
        expect(deepEqual('a', 'a')).toBe(true);
        expect(deepEqual(true, true)).toBe(true);
        expect(deepEqual(null, null)).toBe(true);
    });

    test('unequal primitives', () => {
        expect(deepEqual(1, 2)).toBe(false);
        expect(deepEqual('a', 'b')).toBe(false);
        expect(deepEqual(true, false)).toBe(false);
        expect(deepEqual(null, 1)).toBe(false);
    });

    test('equal arrays', () => {
        expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
        expect(deepEqual(['a', 'b'], ['a', 'b'])).toBe(true);
        expect(deepEqual([], [])).toBe(true);
    });

    test('unequal arrays', () => {
        expect(deepEqual([1, 2, 3], [1, 2])).toBe(false);
        expect(deepEqual([1, 2], [1, 3])).toBe(false);
        expect(deepEqual([1], [])).toBe(false);
    });

    test('equal objects', () => {
        expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
        expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true); // key order doesn't matter
        expect(deepEqual({}, {})).toBe(true);
    });

    test('unequal objects', () => {
        expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
        expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
        expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    });

    test('nested structures', () => {
        expect(deepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 2] } })).toBe(true);
        expect(deepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 3] } })).toBe(false);
    });

    test('type differences', () => {
        expect(deepEqual(1, '1')).toBe(false);
        expect(deepEqual([], {})).toBe(false);
    });
});

describe('syncRedis', () => {
    const mockDynamoImage: ImageItem = {
        parentPath: '/2001/01-01/',
        itemName: 'image.jpg',
        itemType: 'image',
        versionId: 'v1',
        dimensions: { width: 1920, height: 1080 },
        updatedOn: '2001-01-01T00:00:00.000Z',
    };

    const mockRedisImage: RedisImageItem = {
        parentPath: '/2001/01-01/',
        itemName: 'image.jpg',
        itemNameSearchable: 'image jpg',
        itemType: 'image',
        albumDate: new Date(2001, 0, 1).getTime(),
        versionId: 'v1',
        dimensions: { width: 1920, height: 1080 },
    };

    const mockDynamoAlbum: AlbumItem = {
        parentPath: '/2001/',
        itemName: '01-01',
        itemType: 'album',
        published: true,
        updatedOn: '2001-01-01T00:00:00.000Z',
    };

    const mockRedisAlbum: RedisAlbumItem = {
        parentPath: '/2001/',
        itemName: '01-01',
        itemType: 'album',
        albumDate: new Date(2001, 0, 1).getTime(),
        published: true,
    };

    test('item missing from Redis is categorized as missing', async () => {
        const mockRedis = createMockRedisClient();
        // mGet returns array of results; null means key not found
        mockRedis.json.mGet.mockResolvedValue([null]);

        mockDocClient.on(ScanCommand).resolves({
            Items: [mockDynamoImage],
            Count: 1,
        });

        const result = await syncRedis({
            mode: 'diagnose',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(isSyncErrorResult(result)).toBe(false);
        const successResult = result as SyncResult;
        expect(successResult.totalInDynamoDB).toBe(1);
        expect(successResult.missing).toBe(1);
        expect(successResult.mismatched).toBe(0);
        expect(successResult.inSync).toBe(0);
        expect(mockRedis.json.mSet).not.toHaveBeenCalled();
    });

    test('item in both but values differ is categorized as mismatched', async () => {
        const mockRedis = createMockRedisClient();
        // mGet with '$' returns [[value]] for each key; return different version
        mockRedis.json.mGet.mockResolvedValue([
            [
                {
                    ...mockRedisImage,
                    versionId: 'v2', // Different!
                },
            ],
        ]);

        mockDocClient.on(ScanCommand).resolves({
            Items: [mockDynamoImage],
            Count: 1,
        });

        const result = await syncRedis({
            mode: 'diagnose',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(isSyncErrorResult(result)).toBe(false);
        const successResult = result as SyncResult;
        expect(successResult.totalInDynamoDB).toBe(1);
        expect(successResult.missing).toBe(0);
        expect(successResult.mismatched).toBe(1);
        expect(successResult.inSync).toBe(0);
        expect(mockRedis.json.mSet).not.toHaveBeenCalled();
    });

    test('item in both and identical is categorized as in sync', async () => {
        const mockRedis = createMockRedisClient();
        // mGet with '$' returns [[value]] for each key
        mockRedis.json.mGet.mockResolvedValue([[mockRedisImage]]);

        mockDocClient.on(ScanCommand).resolves({
            Items: [mockDynamoImage],
            Count: 1,
        });

        const result = await syncRedis({
            mode: 'diagnose',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(isSyncErrorResult(result)).toBe(false);
        const successResult = result as SyncResult;
        expect(successResult.totalInDynamoDB).toBe(1);
        expect(successResult.missing).toBe(0);
        expect(successResult.mismatched).toBe(0);
        expect(successResult.inSync).toBe(1);
        expect(mockRedis.json.mSet).not.toHaveBeenCalled();
    });

    test('diagnose mode does not write to Redis', async () => {
        const mockRedis = createMockRedisClient();
        mockRedis.json.mGet.mockResolvedValue([null]); // Missing

        mockDocClient.on(ScanCommand).resolves({
            Items: [mockDynamoImage],
            Count: 1,
        });

        await syncRedis({
            mode: 'diagnose',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(mockRedis.json.mSet).not.toHaveBeenCalled();
    });

    test('fix mode writes missing items to Redis', async () => {
        const mockRedis = createMockRedisClient();
        mockRedis.ft.info.mockResolvedValue({}); // Index exists
        mockRedis.json.mGet.mockResolvedValue([null]); // Missing

        mockDocClient.on(ScanCommand).resolves({
            Items: [mockDynamoImage],
            Count: 1,
        });

        const result = await syncRedis({
            mode: 'fix',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(isSyncErrorResult(result)).toBe(false);
        const successResult = result as SyncResult;
        expect(successResult.missing).toBe(1);
        expect(mockRedis.json.mSet).toHaveBeenCalled();
    });

    test('fix mode writes mismatched items to Redis', async () => {
        const mockRedis = createMockRedisClient();
        mockRedis.ft.info.mockResolvedValue({}); // Index exists
        mockRedis.json.mGet.mockResolvedValue([
            [
                {
                    ...mockRedisImage,
                    versionId: 'v2', // Different!
                },
            ],
        ]);

        mockDocClient.on(ScanCommand).resolves({
            Items: [mockDynamoImage],
            Count: 1,
        });

        const result = await syncRedis({
            mode: 'fix',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(isSyncErrorResult(result)).toBe(false);
        const successResult = result as SyncResult;
        expect(successResult.mismatched).toBe(1);
        expect(mockRedis.json.mSet).toHaveBeenCalled();
    });

    test('fix mode throws error if index does not exist', async () => {
        const mockRedis = createMockRedisClient();
        mockRedis.ft.info.mockRejectedValue(new Error('Unknown Index name'));

        await expect(
            syncRedis({
                mode: 'fix',
                redisClient: mockRedis as unknown as RedisClient,
            }),
        ).rejects.toThrow('Search index does not exist. Run with mode "init" first to create it.');
    });

    test('handles albums correctly', async () => {
        const mockRedis = createMockRedisClient();
        mockRedis.json.mGet.mockResolvedValue([[mockRedisAlbum]]);

        mockDocClient.on(ScanCommand).resolves({
            Items: [mockDynamoAlbum],
            Count: 1,
        });

        const result = await syncRedis({
            mode: 'diagnose',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(isSyncErrorResult(result)).toBe(false);
        const successResult = result as SyncResult;
        expect(successResult.inSync).toBe(1);
    });

    test('handles multiple items in single scan', async () => {
        const mockRedis = createMockRedisClient();
        // mGet returns array: first item in sync, second missing
        mockRedis.json.mGet.mockResolvedValue([
            [mockRedisImage], // In sync
            null, // Missing
        ]);

        const secondImage: ImageItem = {
            ...mockDynamoImage,
            itemName: 'image2.jpg',
        };

        mockDocClient.on(ScanCommand).resolves({
            Items: [mockDynamoImage, secondImage],
            Count: 2,
        });

        const result = await syncRedis({
            mode: 'diagnose',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(isSyncErrorResult(result)).toBe(false);
        const successResult = result as SyncResult;
        expect(successResult.totalInDynamoDB).toBe(2);
        expect(successResult.inSync).toBe(1);
        expect(successResult.missing).toBe(1);
    });

    test('handles pagination across multiple scans', async () => {
        const mockRedis = createMockRedisClient();
        // Return matching Redis items for both DynamoDB items (one mGet call per batch)
        mockRedis.json.mGet
            .mockResolvedValueOnce([[mockRedisImage]]) // First batch
            .mockResolvedValueOnce([
                [
                    {
                        ...mockRedisImage,
                        itemName: 'image2.jpg',
                        itemNameSearchable: 'image  jpg', // Numbers stripped, extra space
                    },
                ],
            ]); // Second batch

        // First page with continuation
        mockDocClient
            .on(ScanCommand)
            .resolvesOnce({
                Items: [mockDynamoImage],
                Count: 1,
                LastEvaluatedKey: { pk: 'continue' },
            })
            .resolvesOnce({
                Items: [{ ...mockDynamoImage, itemName: 'image2.jpg' }],
                Count: 1,
            });

        const result = await syncRedis({
            mode: 'diagnose',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(isSyncErrorResult(result)).toBe(false);
        const successResult = result as SyncResult;
        expect(successResult.totalInDynamoDB).toBe(2);
        expect(successResult.inSync).toBe(2);
    });

    test('continuation token resumes from previous position', async () => {
        const mockRedis = createMockRedisClient();
        mockRedis.json.mGet.mockResolvedValue([[mockRedisImage]]);

        const startKey = { parentPath: '/2019/', itemName: '03-15' };
        const token = Buffer.from(JSON.stringify(startKey)).toString('base64');

        mockDocClient.on(ScanCommand).resolves({
            Items: [mockDynamoImage],
            Count: 1,
        });

        await syncRedis({
            mode: 'diagnose',
            continuationToken: token,
            redisClient: mockRedis as unknown as RedisClient,
        });

        // Verify ExclusiveStartKey was passed
        const calls = mockDocClient.commandCalls(ScanCommand);
        expect(calls[0].args[0].input.ExclusiveStartKey).toEqual(startKey);
    });

    test('returns duration in result', async () => {
        const mockRedis = createMockRedisClient();
        mockRedis.json.mGet.mockResolvedValue([[mockRedisImage]]);

        mockDocClient.on(ScanCommand).resolves({
            Items: [mockDynamoImage],
            Count: 1,
        });

        const result = await syncRedis({
            mode: 'diagnose',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('logs only first 10 missing/mismatched items', async () => {
        const consoleSpy = jest.spyOn(console, 'log');
        const mockRedis = createMockRedisClient();

        // Create 15 items, all missing from Redis
        const items = Array.from({ length: 15 }, (_, i) => ({
            ...mockDynamoImage,
            itemName: `image${i}.jpg`,
        }));

        // All items missing from Redis
        mockRedis.json.mGet.mockResolvedValue(items.map(() => null));

        mockDocClient.on(ScanCommand).resolves({
            Items: items,
            Count: 15,
        });

        const result = await syncRedis({
            mode: 'diagnose',
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(isSyncErrorResult(result)).toBe(false);
        const successResult = result as SyncResult;
        // Should report all 15 as missing
        expect(successResult.missing).toBe(15);

        // But only log 10 individual item_missing events
        const missingLogs = consoleSpy.mock.calls.filter((call) => (call[0] as string).includes('item_missing'));
        expect(missingLogs).toHaveLength(10);

        consoleSpy.mockRestore();
    });
});

describe('initRedis', () => {
    test('creates index when it does not exist', async () => {
        const mockRedis = createMockRedisClient();
        mockRedis.ft.info.mockRejectedValue(new Error('Unknown Index name'));
        mockRedis.ft.create.mockResolvedValue('OK');

        const result = await initRedis({
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(result.indexCreated).toBe(true);
        expect(result.indexAlreadyExisted).toBe(false);
        expect(mockRedis.ft.create).toHaveBeenCalled();
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('does not create index when it already exists', async () => {
        const mockRedis = createMockRedisClient();
        mockRedis.ft.info.mockResolvedValue({}); // Index exists

        const result = await initRedis({
            redisClient: mockRedis as unknown as RedisClient,
        });

        expect(result.indexCreated).toBe(false);
        expect(result.indexAlreadyExisted).toBe(true);
        expect(mockRedis.ft.create).not.toHaveBeenCalled();
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('propagates errors other than unknown index', async () => {
        const mockRedis = createMockRedisClient();
        mockRedis.ft.info.mockRejectedValue(new Error('Connection refused'));

        await expect(
            initRedis({
                redisClient: mockRedis as unknown as RedisClient,
            }),
        ).rejects.toThrow('Connection refused');
    });
});
