import { getAlbumAndChildren } from './getAlbumAndChildren';
import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const mockDocClient = mockClient(DynamoDBDocumentClient);

//
// TEST SETUP AND TEARDOWN
//

afterEach(() => {
    mockDocClient.reset();
});

//
// TESTS
//

const tableName = 'NotARealTableName';

test('Get root album', async () => {
    expect.assertions(10);

    // Mock out the AWS 'query' method.  Used to return both the child images and the child albums
    mockDocClient.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 3,
        ScannedCount: 3,
    });

    const result = await getAlbumAndChildren(tableName, '/');
    expect(result).toBeDefined();

    const album = result?.album;
    expect(album).toBeDefined();
    expect(album?.title).toBe('Dean, Lucie, Felix and Milo Moses');
    expect(album?.itemName).toBe('/');
    expect(album?.parentPath).toBe('');

    const children = result?.children;
    expect(children).toBeDefined();
    if (!!children) {
        expect(children[0]).toBeDefined();
        expect(children[0].itemName).toBe('cross_country5.jpg');

        expect(children[1]).toBeDefined();
        expect(children[1].itemName).toBe('cross_country6.jpg');
    }
});

test('Get Images in Album', async () => {
    expect.assertions(6);

    const albumPath = '/2001/12-31/';

    // Mock out the AWS 'get' method
    mockDocClient.on(GetCommand).resolves({
        Item: {
            itemName: '12-31',
            parentPath: '/2001/',
            updatedOn: '2001-12-31T23:59:59.999Z',
        },
    });

    // Mock out the AWS 'query' method.  Used to return both the child images and the child albums
    mockDocClient.on(QueryCommand).resolves({
        Items: mockItems,
        Count: 3,
        ScannedCount: 3,
    });

    const albumResponse = await getAlbumAndChildren(tableName, albumPath);
    expect(albumResponse).toBeDefined();

    expect(albumResponse?.children).toBeDefined();
    if (!!albumResponse?.children) {
        expect(albumResponse?.children[0]).toBeDefined();
        expect(albumResponse?.children[0].itemName).toBe('cross_country5.jpg');

        expect(albumResponse?.children[1]).toBeDefined();
        expect(albumResponse?.children[1].itemName).toBe('cross_country6.jpg');
    }
});

const mockItems = [
    {
        itemName: 'cross_country5.jpg',
        parentPath: '/2001/12-31',
        updatedOn: '2018:11:03 16:25:41',
        dimensions: { width: 4032, height: 3024 },
        tags: ['Person', 'Human', 'Clothing', 'Shorts', 'Crowd', 'People', 'Audience', 'Festival', 'Shoe', 'Footwear'],
    },
    {
        itemName: 'cross_country6.jpg',
        parentPath: '/2001/12-31',
        updatedOn: '2018:11:03 16:25:41',
        dimensions: { width: 4032, height: 3024 },
        tags: [
            'Person',
            'Clothing',
            'Electronics',
            'Sitting',
            'Furniture',
            'Table',
            'Photographer',
            'Tripod',
            'Desk',
            'Wood',
        ],
    },
    {
        imageID: '2001/12-31/cross_country7.jpg',
        parentPath: '/2001/12-31',
        updatedOn: '2018:11:03 16:25:41',
        dimensions: { width: 4032, height: 3024 },
        tags: ['Person', 'Human', 'Sports', 'Sport', 'Cross Country', 'People', 'Crowd', 'Apparel', 'Clothing'],
    },
];
