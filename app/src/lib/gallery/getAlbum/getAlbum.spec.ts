import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getAlbum, getAlbumAndChildren } from './getAlbum';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

test('getAlbum() - no children', async () => {
    const albumPath = '/2001/01-01/';
    const uploadTimeStamp = 1541787209;
    // Mock out the AWS method
    mockDocClient.on(GetCommand).resolves({
        Item: { parentPath: albumPath, title: 'Title', description: 'Description', updatedOn: uploadTimeStamp },
    });
    const result = await getAlbum(albumPath);
    expect(result).toBeDefined();
    expect(result?.parentPath).toBe(albumPath);
    expect(result?.title).toBe('Title');
    expect(result?.description).toBe('Description');
    expect(result?.updatedOn).toBe(uploadTimeStamp);
});

test('Invalid Album Path', async () => {
    expect.assertions(1);
    await expect(getAlbumAndChildren('not/a/valid/path')).rejects.toThrow(/path/);
});

test('Nonexistent Album', async () => {
    expect.assertions(1);
    // Mock out the AWS method to get the album itself (no children)
    mockDocClient.on(GetCommand).resolves({});
    const result = await getAlbumAndChildren('/1900/01-01/');
    expect(result).toBeUndefined();
});

test('Root Album', async () => {
    // Mock out the AWS method that returns children
    mockDocClient.on(QueryCommand).resolves({
        Items: mockAlbums,
        Count: 3,
        ScannedCount: 3,
    });

    const result = await getAlbumAndChildren('/');

    const album = result?.album;
    if (!album) throw new Error('Did not receive album');
    expect(album?.title).toBe('Dean, Lucie, Felix and Milo Moses');
    expect(album?.itemName).toBe('/');
    expect(album?.parentPath).toBe('');

    const children = result?.children;
    if (!children) throw new Error('Did not receive children');
    expect(children[0]?.itemName).toBe('01-01');
    expect(children[1]?.itemName).toBe('01-02');
    expect(children[1]?.published).toBe(true);
});

test('Week Album - Empty', async () => {
    // Mock out the AWS method to get the album itself (no children)
    mockDocClient.on(GetCommand).resolves({
        Item: {
            parentPath: '/2001/',
            itemName: '01-01',
            updatedOn: '2001-01-01T23:59:59.999Z',
            description: 'xxx',
        },
    });
    // Mock out the AWS method that returns children
    mockDocClient.on(QueryCommand).resolves({});
    const albumResponse = await getAlbumAndChildren('/2001/01-01/');
    if (!albumResponse?.album) throw new Error('Did not receive album');
    if (!!albumResponse?.children) throw new Error('Received unexpected children');
    expect(albumResponse.album.description).toBe('xxx');
});

test('Images', async () => {
    // Mock out the AWS method to get the album itself (no children)
    mockDocClient.on(GetCommand).resolves({
        Item: {
            parentPath: '/2001/',
            itemName: '01-01',
            updatedOn: '2001-01-01T23:59:59.999Z',
        },
    });

    // Mock out the AWS method that returns children
    mockDocClient.on(QueryCommand).resolves({
        Items: mockImages,
        Count: 3,
        ScannedCount: 3,
    });

    const children = (await getAlbumAndChildren('/2001/01-01/'))?.children;
    if (!children) throw new Error('Did not receive children');
    expect(children[0]?.itemName).toBe('image1.jpg');
    expect(children[0]?.title).toBe('Title 1');
    expect(children[0]?.description).toBe('Description 1');
    expect(children[0]?.updatedOn).toBe('2001-01-01T23:59:59.999Z');
    expect(children[0]?.tags).toContain('image1_tag1');
    expect(children[1]?.itemName).toBe('image2.jpg');
    expect(children[1]?.title).toBe('Title 2');
    expect(children[1]?.description).toBe('Description 2');
    expect(children[1]?.tags).toContain('image2_tag2');
    expect(children[2]?.tags).toContain('image3_tag3');
});

describe('Prev & Next', () => {
    test('No Prev', async () => {
        // Mock out the AWS method to get the album itself (no children)
        mockDocClient.on(GetCommand).resolves({ Item: { parentPath: '/2001/', itemName: '01-01' } });
        // Mock out the AWS method that returns children
        mockDocClient.on(QueryCommand).resolves({ Items: mockAlbums });
        const albumResponse = await getAlbumAndChildren('/2001/01-01/');
        if (!!albumResponse?.prevAlbum) throw new Error('Not expecting a prev');
        expect(albumResponse?.nextAlbum?.path).toBe('/2001/01-02/');
    });

    test('Next Skips Unpublished', async () => {
        // Mock out the AWS method to get the album itself (no children)
        mockDocClient.on(GetCommand).resolves({ Item: { parentPath: '/2001/', itemName: '01-02' } });
        // Mock out the AWS method that returns children
        mockDocClient.on(QueryCommand).resolves({ Items: mockAlbums });
        const albumResponse = await getAlbumAndChildren('/2001/01-02/');
        expect(albumResponse?.prevAlbum?.path).toBe('/2001/01-01/');
        expect(albumResponse?.nextAlbum?.path).toBe('/2001/01-04/');
    });

    test('Both Prev & Next', async () => {
        // Mock out the AWS method to get the album itself (no children)
        mockDocClient.on(GetCommand).resolves({ Item: { parentPath: '/2001/', itemName: '01-03' } });
        // Mock out the AWS method that returns children
        mockDocClient.on(QueryCommand).resolves({ Items: mockAlbums });
        const albumResponse = await getAlbumAndChildren('/2001/01-03/');
        expect(albumResponse?.prevAlbum?.path).toBe('/2001/01-02/');
        expect(albumResponse?.prevAlbum?.title).toBe('Title 2');
        expect(albumResponse?.nextAlbum?.path).toBe('/2001/01-04/');
        expect(albumResponse?.nextAlbum?.title).toBe('Title 4');
    });

    test('Prev Skips Unpublished', async () => {
        // Mock out the AWS method to get the album itself (no children)
        mockDocClient.on(GetCommand).resolves({ Item: { parentPath: '/2001/', itemName: '01-04' } });
        // Mock out the AWS method that returns children
        mockDocClient.on(QueryCommand).resolves({ Items: mockAlbums });
        const albumResponse = await getAlbumAndChildren('/2001/01-04/');
        expect(albumResponse?.prevAlbum?.path).toBe('/2001/01-02/');
    });

    test('No Next', async () => {
        // Mock out the AWS method to get the album itself (no children)
        mockDocClient.on(GetCommand).resolves({ Item: { parentPath: '/2001/', itemName: '01-04' } });
        // Mock out the AWS method that returns children
        mockDocClient.on(QueryCommand).resolves({ Items: mockAlbums });
        const albumResponse = await getAlbumAndChildren('/2001/01-04/');
        if (!!albumResponse?.nextAlbum) throw new Error('Not expecting a next');
    });
});

const mockImages = [
    {
        itemName: 'image1.jpg',
        itemType: 'image',
        parentPath: '/2001/01-01/',
        title: 'Title 1',
        description: 'Description 1',
        updatedOn: '2001-01-01T23:59:59.999Z',
        dimensions: { width: 4032, height: 3024 },
        tags: ['image1_tag1', 'image1_tag2'],
    },
    {
        itemName: 'image2.jpg',
        itemType: 'image',
        parentPath: '/2001/01-01/',
        title: 'Title 2',
        description: 'Description 2',
        updatedOn: '2001-01-01T23:59:59.999Z',
        dimensions: { width: 4032, height: 3024 },
        tags: ['image2_tag1', 'image2_tag2'],
    },
    {
        itemName: 'image3.jpg',
        itemType: 'image',
        parentPath: '/2001/01-01/',
        title: 'Title 3',
        description: 'Description 3',
        updatedOn: '2001-01-01T23:59:59.999Z',
        dimensions: { width: 4032, height: 3024 },
        tags: ['image3_tag1', 'image3_tag2', 'image3_tag3'],
    },
];

const mockAlbums = [
    {
        itemName: '01-01',
        itemType: 'album',
        parentPath: '/2001/',
        title: 'Title 1',
        description: 'Description 1',
        updatedOn: '2001-01-01T23:59:59.999Z',
        tags: ['album1_tag1', 'album1_tag2'],
        published: true,
    },
    {
        itemName: '01-02',
        itemType: 'album',
        parentPath: '/2001/',
        title: 'Title 2',
        description: 'Description 2',
        updatedOn: '2001-02-01T23:59:59.999Z',
        tags: ['album2_tag1', 'album2_tag2'],
        published: true,
    },
    {
        itemName: '01-03',
        itemType: 'album',
        parentPath: '/2001/',
        title: 'Title 3',
        description: 'Description 3',
        updatedOn: '2001-03-01T23:59:59.999Z',
        tags: ['album3_tag1', 'album3_tag2', 'album3_tag3'],
        published: false,
    },
    {
        itemName: '01-04',
        itemType: 'album',
        parentPath: '/2001/',
        title: 'Title 4',
        description: 'Description 4',
        updatedOn: '2001-04-01T23:59:59.999Z',
        tags: ['album4_tag1', 'album4_tag2'],
        published: true,
    },
];
