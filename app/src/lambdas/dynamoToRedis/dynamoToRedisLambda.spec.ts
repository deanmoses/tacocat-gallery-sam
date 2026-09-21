import { marshall } from '@aws-sdk/util-dynamodb';
import type { Context, DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { handler } from './dynamoToRedisLambda';
import type { RedisClient } from '../../lib/redis_utils/redisClientUtils';
import { createRedisWriteClient } from '../../lib/redis_utils/redisClientUtils';
import type { RedisGalleryItem } from '../../lib/redis_utils/redisTypes';
import { pathToDate } from '../../lib/gallery_path_utils/galleryPathUtils';
import type { AlbumItem, GalleryItem, ImageItem, VideoItem } from '../../lib/gallery/galleryTypes';

jest.mock('../../lib/redis_utils/redisClientUtils');
const mockCreateRedisWriteClient = jest.mocked(createRedisWriteClient);

type Written = { key: string; path: string; value: RedisGalleryItem };
const mSet = jest.fn<Promise<string>, [Written[]]>();
const del = jest.fn<Promise<number>, [string[]]>();
const close = jest.fn<Promise<void>, []>();

/** Everything one invocation wrote, in order */
function written(): Written[] {
    return mSet.mock.calls.flatMap(([items]) => items);
}

const image: ImageItem = {
    parentPath: '/2001/12-31/',
    itemName: 'image.jpg',
    itemType: 'image',
    versionId: 'v1',
    dimensions: { width: 4000, height: 3000 },
    title: 'Sunset',
    tags: ['beach'],
};
const video: VideoItem = {
    parentPath: '/2001/12-31/',
    itemName: 'clip.mp4',
    itemType: 'image',
    mediaType: 'video',
    versionId: 'v2',
    dimensions: { width: 1920, height: 1080 },
    duration: 12.5,
};
const album: AlbumItem = { parentPath: '/2001/', itemName: '12-31', itemType: 'album', published: true };

function upsert(eventName: 'INSERT' | 'MODIFY', item: GalleryItem): DynamoDBRecord {
    // The stream types and the SDK each declare their own AttributeValue; the shapes are the same
    const NewImage = marshall(item) as unknown as NonNullable<DynamoDBRecord['dynamodb']>['NewImage'];
    return { eventName, dynamodb: { NewImage } };
}

function key({ parentPath, itemName }: GalleryItem): { parentPath?: string; itemName?: string } {
    return { parentPath, itemName };
}

function remove(parentPath: string, itemName: string): DynamoDBRecord {
    return { eventName: 'REMOVE', dynamodb: { Keys: { parentPath: { S: parentPath }, itemName: { S: itemName } } } };
}

function invoke(...records: DynamoDBRecord[]): Promise<void> {
    const event: DynamoDBStreamEvent = { Records: records };
    return handler(event, {} as Context, () => undefined) as Promise<void>;
}

beforeEach(() => {
    jest.spyOn(console, 'info').mockReturnValue(undefined);
    jest.spyOn(console, 'warn').mockReturnValue(undefined);
    mSet.mockResolvedValue('OK');
    del.mockResolvedValue(1);
    close.mockResolvedValue(undefined);
    mockCreateRedisWriteClient.mockResolvedValue({ json: { mSet }, del, close } as unknown as RedisClient);
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('an inserted or modified item', () => {
    it('is written under its gallery path, converted to the Redis shape', async () => {
        await invoke(upsert('INSERT', image));

        expect(written()).toStrictEqual([
            {
                key: '/2001/12-31/image.jpg',
                path: '$',
                value: {
                    parentPath: '/2001/12-31/',
                    itemName: 'image.jpg',
                    itemNameSearchable: 'image jpg',
                    itemType: 'image',
                    albumDate: pathToDate('/2001/12-31/image.jpg').getTime(),
                    versionId: 'v1',
                    dimensions: { width: 4000, height: 3000 },
                    title: 'Sunset',
                    tags: ['photo', 'image', 'picture', 'beach'],
                },
            },
        ]);
        expect(del).not.toHaveBeenCalled();
    });

    it('keeps a video distinct from an image, both of which the table stores as itemType image', async () => {
        await invoke(upsert('MODIFY', video));

        expect(written().map((item) => item.key)).toStrictEqual(['/2001/12-31/clip.mp4']);
        expect(written()[0].value).toMatchObject({
            mediaType: 'video',
            duration: 12.5,
            tags: ['movie', 'video', 'clip'],
        });
    });

    it('writes an album under its path with the trailing slash', async () => {
        await invoke(upsert('MODIFY', album));

        expect(written().map((item) => item.key)).toStrictEqual(['/2001/12-31/']);
        expect(written()[0].value).toMatchObject({ published: true });
    });
});

describe('a removed item', () => {
    it('is deleted from Redis by its gallery path', async () => {
        await invoke(remove('/2001/12-31/', 'image.jpg'));

        expect(del).toHaveBeenCalledWith(['/2001/12-31/image.jpg']);
        expect(mSet).not.toHaveBeenCalled();
    });

    it('is deleted by its album path when it is an album', async () => {
        await invoke(remove('/2001/', '12-31'));

        expect(del).toHaveBeenCalledWith(['/2001/12-31/']);
    });
});

describe('a batch', () => {
    it('applies every record over one connection, then closes it', async () => {
        await invoke(upsert('INSERT', image), remove('/2001/12-31/', 'old.jpg'), upsert('MODIFY', album));

        expect(mockCreateRedisWriteClient).toHaveBeenCalledTimes(1);
        expect(mSet).toHaveBeenCalledTimes(1);
        expect(written().map((item) => item.key)).toStrictEqual(['/2001/12-31/image.jpg', '/2001/12-31/']);
        expect(del).toHaveBeenCalledWith(['/2001/12-31/old.jpg']);
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('closes the connection even when the write fails, and fails the invocation so the stream retries', async () => {
        mSet.mockRejectedValue(new Error('READONLY You cannot write against a read only replica'));

        await expect(invoke(upsert('INSERT', image))).rejects.toThrow(/READONLY/);

        expect(close).toHaveBeenCalledTimes(1);
    });

    it('rejects an item the table holds but Redis cannot index, rather than writing the rest', async () => {
        const imageWithoutVersion = { ...key(image), itemType: 'image', dimensions: image.dimensions } as ImageItem;

        await expect(invoke(upsert('INSERT', album), upsert('INSERT', imageWithoutVersion))).rejects.toThrow(
            /versionId/,
        );

        expect(mockCreateRedisWriteClient).not.toHaveBeenCalled();
    });
});

describe('nothing to sync', () => {
    it('opens no connection for an empty batch', async () => {
        await invoke();

        expect(mockCreateRedisWriteClient).not.toHaveBeenCalled();
    });

    it('opens no connection for a record with neither a new image nor a removal', async () => {
        await invoke({
            eventName: 'INSERT',
            dynamodb: { Keys: { parentPath: { S: '/2001/' }, itemName: { S: '12-31' } } },
        });

        expect(console.warn).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'dynamo_to_redis_unhandled_event', dynamoEvent: 'INSERT' }),
        );
        expect(mockCreateRedisWriteClient).not.toHaveBeenCalled();
    });
});
