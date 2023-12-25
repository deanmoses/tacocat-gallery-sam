import { ImageItem } from '../../lib/gallery/galleryTypes';
import { RedisImageItem } from '../../lib/redis_utils/redisTypes';
import { toRedisItem, toSearchableItemName } from './convertDynamoToRedis';

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
        albumDate: 1009785600000,
        versionId: 'VERSION',
        title: 'HTML & Entity',
        description: '<p>HTML &amp; Entity</p>',
        dimensions: {
            width: 1280,
            height: 960,
        },
    };
    expect(toRedisItem(awsImageItem)).toEqual(redisImageItem);
});

test.todo('convert album');
