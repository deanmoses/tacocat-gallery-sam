import { ImageItem, VideoItem } from '../gallery/galleryTypes';
import { RedisImageItem, RedisVideoItem } from './redisTypes';
import { toRedisItem, toSearchableItemName } from './toRedisFromDynamo';

describe('searchable filenames', () => {
    const tests: { itemName: string; expected: string }[] = [
        { itemName: 'pat.jpg', expected: 'pat jpg' },
        { itemName: 'pat1.jpg', expected: 'pat  jpg' },
        { itemName: 'pat-1.jpg', expected: 'pat   jpg' },
        { itemName: '1xxx01yyy1.jpg', expected: ' xxx  yyy  jpg' },
        { itemName: 'xxx_yyy.jpg', expected: 'xxx yyy jpg' },
    ];
    test.each(tests)('%s => %s)', ({ itemName, expected }) => {
        expect(toSearchableItemName(itemName)).toBe(expected);
    });
});

test('convert image', () => {
    const awsImageItem: ImageItem = {
        itemType: 'image',
        parentPath: '/2001/12-31/',
        itemName: 'image.jpg',
        updatedOn: '2014-12-04T08:00:00.000Z',
        versionId: 'VERSION',
        title: 'HTML & Entity',
        description: '<p>HTML &amp; Entity</p>',
        dimensions: {
            width: 1280,
            height: 960,
        },
    };
    const redisImageItem: RedisImageItem = {
        itemType: 'image',
        parentPath: '/2001/12-31/',
        itemName: 'image.jpg',
        itemNameSearchable: 'image jpg',
        albumDate: new Date(2001, 11, 31).getTime(), // Dec 31, 2001 in local timezone
        versionId: 'VERSION',
        title: 'HTML & Entity',
        description: '<p>HTML &amp; Entity</p>',
        dimensions: {
            width: 1280,
            height: 960,
        },
        tags: ['photo', 'image', 'picture'],
    };
    expect(toRedisItem(awsImageItem)).toEqual(redisImageItem);
});

test('convert video', () => {
    const awsVideoItem: VideoItem = {
        itemType: 'image',
        mediaType: 'video',
        parentPath: '/2024/06-15/',
        itemName: 'vacation.mp4',
        updatedOn: '2024-06-15T10:00:00.000Z',
        id: 'abc123-uuid',
        versionId: 'VERSION456',
        dimensions: {
            width: 1920,
            height: 1080,
        },
        duration: 120,
        title: 'Beach Day',
    };
    const redisVideoItem: RedisVideoItem = {
        itemType: 'image',
        mediaType: 'video',
        parentPath: '/2024/06-15/',
        itemName: 'vacation.mp4',
        itemNameSearchable: 'vacation mp ',
        albumDate: new Date(2024, 5, 15).getTime(), // June 15, 2024 in local timezone
        id: 'abc123-uuid',
        versionId: 'VERSION456',
        dimensions: {
            width: 1920,
            height: 1080,
        },
        duration: 120,
        title: 'Beach Day',
        tags: ['movie', 'video', 'clip'],
    };
    expect(toRedisItem(awsVideoItem)).toEqual(redisVideoItem);
});

test('convert video with zero duration', () => {
    const awsVideoItem: VideoItem = {
        itemType: 'image',
        mediaType: 'video',
        parentPath: '/2024/06-15/',
        itemName: 'short.mp4',
        updatedOn: '2024-06-15T10:00:00.000Z',
        id: 'xyz789-uuid',
        versionId: 'VERSION789',
        dimensions: {
            width: 640,
            height: 480,
        },
        duration: 0,
    };
    const result = toRedisItem(awsVideoItem);
    expect(result).toMatchObject({
        itemType: 'image',
        mediaType: 'video',
        duration: 0,
        id: 'xyz789-uuid',
    });
});

test.todo('convert album');
