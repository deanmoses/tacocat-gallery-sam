import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { AlbumItem, GalleryItem, ImageItem } from '../galleryTypes';
import { search } from './search';

const mockDDBClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDDBClient.reset();
});

test('Short search should fail', async () => {
    mockDDBClient.on(ScanCommand).resolves({ Items: mockScanResults }); // Mock out the DDB table scan
    await expect(search(undefined)).rejects.toThrow(/terms/i);
    await expect(search('12')).rejects.toThrow(/characters/i);
});

test('Results should include path', async () => {
    mockDDBClient.on(ScanCommand).resolves({ Items: mockScanResults }); // Mock out the DDB table scan
    const searchResults = await search('rocket');
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].item.path).toBe('/2018/01-24/');
});

test('Should find by title', async () => {
    mockDDBClient.on(ScanCommand).resolves({ Items: mockScanResults }); // Mock out the DDB table scan
    const searchResults = await search('rocket');
    expect(searchResults.length).toBe(1);
    expect((searchResults[0].item as ImageItem).title).toBe('A space rocket');
});

test('Should find by description', async () => {
    mockDDBClient.on(ScanCommand).resolves({ Items: mockScanResults }); // Mock out the DDB table scan
    const searchResults = await search('coffee');
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].item.description).toBe('A coffee mug');
});

test('Should find by image filename', async () => {
    mockDDBClient.on(ScanCommand).resolves({ Items: mockScanResults }); // Mock out the DDB table scan
    const searchResults = await search('jupiter');
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].item.itemName).toBe('jupiter.jpg');
});

test('Should find by tag', async () => {
    mockDDBClient.on(ScanCommand).resolves({ Items: mockScanResults }); // Mock out the DDB table scan
    const searchResults = await search('sarcophagus');
    expect(searchResults.length).toBe(1);
    expect((searchResults[0].item as ImageItem).tags).toContain('sarcophagus');
});

test('Should find multiple by tag', async () => {
    mockDDBClient.on(ScanCommand).resolves({ Items: mockScanResults }); // Mock out the DDB table scan
    const searchResults = await search('parade');
    expect(searchResults.length).toBeGreaterThanOrEqual(4);
    expect((searchResults[0].item as ImageItem).tags).toContain('parade');
});

test('Should find "taylor swift" all over', async () => {
    mockDDBClient.on(ScanCommand).resolves({ Items: mockScanResults }); // Mock out the DDB table scan
    const searchResults = await search('taylor swift');
    expect(searchResults.length).toBeGreaterThanOrEqual(4);
    expect((searchResults[0].item as ImageItem).title).toBe('Taylor Swift');
});

test('Should find diacriticals', async () => {
    mockDDBClient.on(ScanCommand).resolves({ Items: mockScanResults }); // Mock out the DDB table scan

    let searchResults = await search('cafe');
    expect(searchResults.length).toBe(1);
    expect((searchResults[0].item as ImageItem).title).toBe('Café Français');

    searchResults = await search('francais');
    expect(searchResults.length).toBe(1);
    expect((searchResults[0].item as ImageItem).title).toBe('Café Français');
});

test('Should not return unpublished albums', async () => {
    mockDDBClient.on(ScanCommand).resolves({ Items: mockScanResults }); // Mock out the DDB table scan
    const searchResults = await search('pppp');
    expect(searchResults.length).toBe(1);
    expect((searchResults[0].item as AlbumItem).path).toBe('/2018/01-26/');
});

test.todo('Should not return images in unpublished albums');
test.todo('Should search 35k images fast enough');

const mockScanResults: GalleryItem[] = [
    {
        itemType: 'album',
        updatedOn: '2023-11-05T22:17:45.724Z',
        thumbnail: { versionId: '123456789', path: '/2023/01-01/image.jpg' },
        parentPath: '/2023/',
        itemName: '01-01',
        published: true,
    },
    { itemType: 'album', updatedOn: '2023-10-26T08:37:27.428Z', parentPath: '/2023/', itemName: '01-07' },
    {
        itemType: 'album',
        updatedOn: '2023-11-06T01:08:43.661Z',
        thumbnail: { versionId: '123456789', path: '/2001/01-01/image.jpg' },
        parentPath: '/2001/',
        itemName: '01-01',
        published: true,
    },
    {
        itemType: 'album',
        updatedOn: '2023-11-02T07:55:45.847Z',
        thumbnail: { versionId: '123456789', path: '/2001/12-31/new_name.jpg' },
        parentPath: '/2001/',
        itemName: '12-31',
        published: true,
    },
    { itemType: 'album', updatedOn: '2023-10-26T23:23:48.108Z', parentPath: '/2003/', itemName: '01-01' },
    { itemType: 'album', updatedOn: '2023-11-06T06:55:26.287Z', parentPath: '/', itemName: '1949', published: true },
    {
        itemType: 'album',
        updatedOn: '2023-11-06T00:48:51.138Z',
        description: "Here's what we did this year",
        parentPath: '/',
        itemName: '2001',
        title: '',
        published: true,
    },
    {
        itemType: 'album',
        updatedOn: '2023-10-23T16:05:35.650Z',
        parentPath: '/',
        itemName: '2002',
        title: 'My Brand New Title',
        published: true,
    },
    { itemType: 'album', updatedOn: '2023-10-23T22:34:38.741Z', parentPath: '/', itemName: '2003', published: true },
    { itemType: 'album', updatedOn: '2023-10-23T22:35:51.477Z', parentPath: '/', itemName: '2004', published: true },
    { itemType: 'album', updatedOn: '2023-10-23T22:43:25.557Z', parentPath: '/', itemName: '2005', published: true },
    { itemType: 'album', updatedOn: '2023-10-24T15:00:14.905Z', parentPath: '/', itemName: '2023', published: true },
    {
        itemType: 'album',
        updatedOn: '2023-10-27T04:45:57.951Z',
        parentPath: '/2019/',
        itemName: '01-24',
        published: true,
    },
    {
        itemType: 'album',
        updatedOn: '2023-10-27T04:38:02.690Z',
        description: 'Updated description 1',
        parentPath: '/2018/',
        itemName: '01-24',
        title: 'A space rocket',
        published: true,
    },
    {
        itemType: 'album',
        updatedOn: '2023-10-27T04:38:02.690Z',
        description: 'pppp unpublished',
        parentPath: '/2018/',
        itemName: '01-25',
        /* not published */
    },
    {
        itemType: 'album',
        updatedOn: '2023-10-27T04:38:02.690Z',
        description: 'pppp published',
        parentPath: '/2018/',
        itemName: '01-26',
        published: true,
    },
    {
        itemType: 'image',
        versionId: '123456789',
        updatedOn: '2023-11-06T01:08:43.406Z',
        description: 'A coffee mug',
        parentPath: '/2001/01-01/',
        itemName: 'image.jpg',
        tags: ['test1', 'test2', 'test3'],
        title: 'Image Title',
    },
    {
        itemType: 'image',
        versionId: '123456789',
        updatedOn: '2023-10-30T18:47:45.699Z',
        parentPath: '/2001/01-01/',
        itemName: 'tswift.png',
    },
    {
        itemType: 'image',
        versionId: '123456789',
        updatedOn: '2023-11-01T20:14:54.812Z',
        description: "Portriat from the cover of Taylor's Lover album",
        parentPath: '/2001/01-01/',
        itemName: 'unique.jpg',
        tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
        title: 'Taylor Swift',
    },
    {
        itemType: 'image',
        versionId: '123456789',
        updatedOn: '2023-11-01T20:20:52.735Z',
        description: "Portriat from the cover of Taylor's Lover album",
        parentPath: '/2001/01-01/',
        itemName: 'unique2.jpg',
        tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
        title: 'Taylor Swift',
    },
    {
        updatedOn: '2023-11-04T21:57:25.519Z',
        itemType: 'image',
        versionId: '123456789',
        description: "Portriat from the cover of Taylor's Lover album",
        parentPath: '/2023/01-01/',
        itemName: '1.jpg',
        tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
        title: 'Taylor Swift',
    },
    {
        updatedOn: '2023-11-04T21:59:43.216Z',
        itemType: 'image',
        versionId: '123456789',
        description: "Portriat from the cover of Taylor's Lover album",
        parentPath: '/2023/01-01/',
        itemName: '2.jpg',
        tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
        title: 'Taylor Swift',
    },
    {
        updatedOn: '2023-11-05T22:17:45.503Z',
        itemType: 'image',
        versionId: '123456789',
        description: 'Test description',
        parentPath: '/2023/01-01/',
        itemName: 'jupiter.jpg',
        tags: ['test1', 'test2', 'test3'],
        title: 'Café Français',
    },
    {
        updatedOn: '2023-10-28T08:57:38.641Z',
        itemType: 'image',
        versionId: '123456789',
        parentPath: '/2001/12-31/',
        itemName: 'image-1698483261758.jpg',
        tags: ['halloween', 'dog', 'parade'],
        title: 'Royal corgi footstools',
    },
    {
        updatedOn: '2023-10-28T08:57:16.959Z',
        itemType: 'image',
        versionId: '123456789',
        parentPath: '/2001/12-31/',
        itemName: 'image-1698483433790.jpg',
        tags: ['halloween', 'dog', 'parade'],
        title: 'Royal corgi footstools',
    },
    {
        updatedOn: '2023-10-28T09:03:19.095Z',
        itemType: 'image',
        versionId: '123456789',
        description: 'My image description',
        parentPath: '/2001/12-31/',
        itemName: 'image-1698483795958.jpg',
        tags: ['halloween', 'dog', 'parade'],
        title: 'My Image Title',
    },
    {
        updatedOn: '2023-10-28T09:30:31.913Z',
        itemType: 'image',
        versionId: '123456789',
        description: 'My image description',
        parentPath: '/2001/12-31/',
        itemName: 'image-1698485428921.jpg',
        tags: ['halloween', 'dog', 'parade'],
        title: 'My Image Title',
    },
    {
        updatedOn: '2023-11-03T00:46:09.419Z',
        itemType: 'image',
        versionId: '123456789',
        description: 'My image description',
        parentPath: '/2001/12-31/',
        itemName: 'image-1698972364714.jpg',
        tags: ['halloween', 'dog', 'parade'],
        title: 'My Image Title',
    },
    {
        updatedOn: '2023-11-03T00:57:26.473Z',
        itemType: 'image',
        versionId: '123456789',
        description: 'My image description',
        parentPath: '/2001/12-31/',
        itemName: 'image-1698973042977.jpg',
        tags: ['halloween', 'dog', 'parade'],
        title: 'My Image Title',
    },
    {
        updatedOn: '2023-11-03T00:58:35.456Z',
        itemType: 'image',
        versionId: '123456789',
        description: 'My image description',
        parentPath: '/2001/12-31/',
        itemName: 'image-1698973112843.jpg',
        tags: ['halloween', 'dog', 'parade'],
        title: 'My Image Title',
    },
    {
        updatedOn: '2023-11-03T01:02:36.935Z',
        itemType: 'image',
        versionId: '123456789',
        description: 'My image description',
        parentPath: '/2001/12-31/',
        itemName: 'image-1698973354247.jpg',
        tags: ['halloween', 'dog', 'parade'],
        title: 'My Image Title',
    },
    {
        updatedOn: '2023-11-03T01:17:13.994Z',
        itemType: 'image',
        versionId: '123456789',
        description: 'My image description',
        parentPath: '/2001/12-31/',
        itemName: 'image-1698974230416.jpg',
        tags: ['halloween', 'dog', 'sarcophagus'],
        title: 'My Image Title',
    },
    {
        updatedOn: '2023-11-01T06:21:10.156Z',
        itemType: 'image',
        versionId: '123456789',
        description: 'My image description',
        parentPath: '/2001/12-31/',
        itemName: 'image.jpg',
        tags: ['halloween', 'dog', 'parade'],
        title: 'My Image Title',
    },
];
