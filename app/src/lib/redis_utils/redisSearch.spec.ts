import { mockClient } from 'aws-sdk-client-mock';
import { BatchGetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { searchRedis } from './redisSearch';
import * as redisClientUtils from './redisClientUtils';
import type { AlbumItem, ImageItem, VideoItem } from '../gallery/galleryTypes';

jest.mock('./redisClientUtils');

const mockCreateRedisSearchClient = jest.mocked(redisClientUtils.createRedisSearchClient);
const mockDocClient = mockClient(DynamoDBDocumentClient);

/** The shape of a document as node-redis returns it from ft.search */
type RedisDoc = { id: string; value: Record<string, unknown> };

const ftSearch = jest.fn();
const close = jest.fn();

/** Have the next search return these documents */
function redisReturns(documents: RedisDoc[], total = documents.length): void {
    ftSearch.mockResolvedValue({ total, documents });
}

/** A copy of the document with the given fields left out, as a Redis document missing them would be */
function without(doc: RedisDoc, ...fields: string[]): RedisDoc {
    const value = { ...doc.value };
    for (const field of fields) delete value[field];
    return { id: doc.id, value };
}

/** The query string and options the last search sent to Redis */
function lastSearch(): { index: string; query: string; options: Record<string, unknown> } {
    const [index, query, options] = ftSearch.mock.calls[0] as [string, string, Record<string, unknown>];
    return { index, query, options };
}

const albumDoc: RedisDoc = {
    id: '/2001/12-31/',
    value: {
        itemType: 'album',
        '$.parentPath': '/2001/',
        '$.itemName': '12-31',
        '$.published': true,
        '$.thumbnail': JSON.stringify({ path: '/2001/12-31/image.jpg' }),
        summary: 'New Year',
    },
};

const imageDoc: RedisDoc = {
    id: '/2001/12-31/image.jpg',
    value: {
        itemType: 'image',
        '$.parentPath': '/2001/12-31/',
        '$.itemName': 'image.jpg',
        '$.versionId': 'v1',
        '$.dimensions': JSON.stringify({ width: 400, height: 300 }),
        '$.thumbnail': JSON.stringify({ x: 1, y: 2, width: 30, height: 30 }),
        title: 'Fireworks',
    },
};

const videoDoc: RedisDoc = {
    id: '/2001/12-31/video.mp4',
    value: {
        itemType: 'image',
        '$.mediaType': 'video',
        '$.parentPath': '/2001/12-31/',
        '$.itemName': 'video.mp4',
        '$.versionId': 'v2',
        '$.dimensions': JSON.stringify({ width: 1920, height: 1080 }),
        '$.duration': 12.5,
    },
};

beforeEach(() => {
    mockDocClient.reset();
    ftSearch.mockReset();
    close.mockReset();
    mockCreateRedisSearchClient.mockResolvedValue({
        ft: { search: ftSearch },
        close,
    } as unknown as redisClientUtils.RedisClient);
    // The thumbnail lookup that follows any search returning an album
    mockDocClient.on(BatchGetCommand).resolves({
        Responses: {
            [process.env.GALLERY_ITEM_DDB_TABLE as string]: [
                { parentPath: '/2001/12-31/', itemName: 'image.jpg', versionId: 'v1', thumbnail: { x: 1, y: 2 } },
            ],
        },
    });
});

describe('the query sent to Redis', () => {
    beforeEach(() => redisReturns([]));

    it('searches the gallery index for the terms, newest first, forty at a time by default', async () => {
        await searchRedis({ terms: 'fireworks' });

        const { index, query, options } = lastSearch();

        expect(index).toBe('idx:gallery');
        expect(query).toBe('fireworks');
        expect(options).toMatchObject({
            SORTBY: { BY: 'date', DIRECTION: 'DESC' },
            LIMIT: { from: 0, size: 40 },
        });
    });

    it('asks for every field the mapping reads', async () => {
        await searchRedis({ terms: 'fireworks' });

        expect(lastSearch().options.RETURN).toStrictEqual(
            expect.arrayContaining([
                'itemType',
                '$.parentPath',
                '$.itemName',
                '$.versionId',
                '$.thumbnail',
                'title',
                'summary',
                '$.published',
                '$.dimensions',
                '$.duration',
                '$.mediaType',
            ]),
        );
    });

    it('passes direction and paging through', async () => {
        await searchRedis({ terms: 'fireworks', direction: 'ASC', limit: { from: 80, size: 20 } });

        expect(lastSearch().options).toMatchObject({
            SORTBY: { BY: 'date', DIRECTION: 'ASC' },
            LIMIT: { from: 80, size: 20 },
        });
    });

    it('filters on item type with a tag clause', async () => {
        await searchRedis({ terms: 'fireworks', itemType: 'album' });

        expect(lastSearch().query).toBe('fireworks @itemType:{album}');
    });

    it('bounds the date range with epoch milliseconds', async () => {
        const startDate = new Date('1999-01-01T00:00:00Z');
        const endDate = new Date('2005-12-31T23:59:59Z');
        await searchRedis({ terms: 'fireworks', startDate, endDate });

        expect(lastSearch().query).toBe(`fireworks @date:[${startDate.getTime()} ${endDate.getTime()}]`);
    });

    it('leaves an open-ended range open', async () => {
        const startDate = new Date('1999-01-01T00:00:00Z');
        await searchRedis({ terms: 'fireworks', startDate });

        expect(lastSearch().query).toBe(`fireworks @date:[${startDate.getTime()} +inf]`);

        ftSearch.mockClear();
        await searchRedis({ terms: 'fireworks', endDate: startDate });

        expect(lastSearch().query).toBe(`fireworks @date:[-inf ${startDate.getTime()}]`);
    });

    it('omits the date clause when neither bound is given', async () => {
        await searchRedis({ terms: 'fireworks', itemType: 'image' });

        expect(lastSearch().query).toBe('fireworks @itemType:{image}');
    });
});

describe('the connection', () => {
    it('is closed after a search', async () => {
        redisReturns([]);
        await searchRedis({ terms: 'fireworks' });

        expect(close).toHaveBeenCalledTimes(1);
    });

    it('is closed when the search fails', async () => {
        ftSearch.mockRejectedValue(new Error('Redis is down'));

        await expect(searchRedis({ terms: 'fireworks' })).rejects.toThrow('Redis is down');
        expect(close).toHaveBeenCalledTimes(1);
    });
});

describe('the results', () => {
    it('carry the total even when it exceeds the page', async () => {
        redisReturns([imageDoc], 123);

        const results = await searchRedis({ terms: 'fireworks' });

        expect(results.total).toBe(123);
        expect(results.items).toHaveLength(1);
    });

    it('map an album document to an album item', async () => {
        redisReturns([albumDoc]);

        const [album] = (await searchRedis({ terms: 'new year' })).items as AlbumItem[];

        expect(album).toStrictEqual({
            path: '/2001/12-31/',
            parentPath: '/2001/',
            itemName: '12-31',
            itemType: 'album',
            published: true,
            summary: 'New Year',
            thumbnail: { path: '/2001/12-31/image.jpg', versionId: 'v1', crop: { x: 1, y: 2 } },
        });
    });

    it('fill in the album thumbnail from DynamoDB rather than from Redis', async () => {
        redisReturns([albumDoc]);

        await searchRedis({ terms: 'new year' });

        expect(mockDocClient).toHaveReceivedCommandWith(BatchGetCommand, {
            RequestItems: {
                [process.env.GALLERY_ITEM_DDB_TABLE as string]: expect.objectContaining({
                    Keys: [{ parentPath: '/2001/12-31/', itemName: 'image.jpg' }],
                }) as unknown,
            },
        });
    });

    it('leave out the album summary when there is none', async () => {
        redisReturns([without(albumDoc, 'summary')]);

        const [album] = (await searchRedis({ terms: 'new year' })).items;

        expect(album).not.toHaveProperty('summary');
    });

    it('reject an album without a thumbnail', async () => {
        redisReturns([without(albumDoc, '$.thumbnail')]);

        await expect(searchRedis({ terms: 'new year' })).rejects.toThrow(/thumbnail/i);
    });

    it('map an image document to an image item', async () => {
        redisReturns([imageDoc]);

        const [image] = (await searchRedis({ terms: 'fireworks' })).items as ImageItem[];

        expect(image).toStrictEqual({
            path: '/2001/12-31/image.jpg',
            parentPath: '/2001/12-31/',
            itemName: 'image.jpg',
            itemType: 'image',
            versionId: 'v1',
            dimensions: { width: 400, height: 300 },
            thumbnail: { x: 1, y: 2, width: 30, height: 30 },
            title: 'Fireworks',
        });
    });

    it('leave out image title and crop when there are none', async () => {
        redisReturns([without(imageDoc, 'title', '$.thumbnail')]);

        const [image] = (await searchRedis({ terms: 'fireworks' })).items;

        expect(image).not.toHaveProperty('title');
        expect(image).not.toHaveProperty('thumbnail');
    });

    it('do not look up DynamoDB for images alone', async () => {
        redisReturns([imageDoc]);

        await searchRedis({ terms: 'fireworks' });

        expect(mockDocClient).not.toHaveReceivedCommand(BatchGetCommand);
    });

    it('map a video document, which Redis files under the image type, to a video item', async () => {
        redisReturns([videoDoc]);

        const [video] = (await searchRedis({ terms: 'fireworks' })).items as VideoItem[];

        expect(video).toStrictEqual({
            path: '/2001/12-31/video.mp4',
            parentPath: '/2001/12-31/',
            itemName: 'video.mp4',
            itemType: 'image',
            mediaType: 'video',
            versionId: 'v2',
            dimensions: { width: 1920, height: 1080 },
            duration: 12.5,
        });
    });

    it('reject a video without a duration', async () => {
        redisReturns([without(videoDoc, '$.duration')]);

        await expect(searchRedis({ terms: 'fireworks' })).rejects.toThrow(/duration/i);
    });

    it('reject an unknown item type', async () => {
        redisReturns([{ id: '/2001/', value: { itemType: 'folder' } }]);

        await expect(searchRedis({ terms: 'fireworks' })).rejects.toThrow(/itemType/i);
    });

    it('keep albums and media in the order Redis ranked them', async () => {
        redisReturns([imageDoc, albumDoc, videoDoc]);

        const paths = (await searchRedis({ terms: 'fireworks' })).items.map((item) => item.path);

        expect(paths).toStrictEqual(['/2001/12-31/image.jpg', '/2001/12-31/', '/2001/12-31/video.mp4']);
    });
});
