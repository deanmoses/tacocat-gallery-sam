import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getAlbum, getAlbumAndChildren } from './getAlbum';
import { AlbumItem, ImageItem } from '../galleryTypes';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

describe('getAlbum()', () => {
    test('Guest should be able to retrieve published day album', async () => {
        const albumPath = '/2001/01-01/';
        const uploadTimeStamp = new Date().toISOString();
        // Mock out AWS method to get album
        mockDocClient.on(GetCommand, {}).resolves({
            Item: {
                parentPath: '/2001/',
                itemName: '01-01',
                itemType: 'album',
                description: 'Description',
                updatedOn: uploadTimeStamp,
                published: true,
            } satisfies AlbumItem,
        });
        const result = await getAlbum(albumPath);
        if (!result) throw new Error('Did not receive album');
        expect(result.path).toBe(albumPath);
        expect(result.parentPath).toBe('/2001/');
        expect(result.itemName).toBe('01-01');
        expect(result.description).toBe('Description');
        expect(result.updatedOn).toBe(uploadTimeStamp);
        expect(result.published).toBe(true);
    });

    test("Guest shouldn't be able to retrieve unpublished day album", async () => {
        const albumPath = '/2001/01-01/';
        const uploadTimeStamp = new Date().toISOString();
        // Mock out AWS method to get album
        mockDocClient.on(GetCommand, {}).resolves({
            Item: {
                parentPath: '/2001/',
                itemName: '01-01',
                itemType: 'album',
                updatedOn: uploadTimeStamp,
            } satisfies AlbumItem,
        });
        const result = await getAlbum(albumPath);
        if (result) throw new Error('Expected to not retrieve album');
    });

    test('Admin should be able to retrieve unpublished day album', async () => {
        const albumPath = '/2001/01-01/';
        const uploadTimeStamp = new Date().toISOString();
        // Mock out AWS method to get album
        mockDocClient.on(GetCommand, {}).resolves({
            Item: {
                parentPath: '/2001/',
                itemName: '01-01',
                itemType: 'album',
                description: 'Description',
                updatedOn: uploadTimeStamp,
            } satisfies AlbumItem,
        });
        const includeUnpublishedAlbums = true;
        const result = await getAlbum(albumPath, includeUnpublishedAlbums);
        if (!result) throw new Error('Did not receive album');
        expect(result.path).toBe(albumPath);
        expect(result.parentPath).toBe('/2001/');
        expect(result.itemName).toBe('01-01');
        expect(result.description).toBe('Description');
        expect(result.updatedOn).toBe(uploadTimeStamp);
    });

    test('Guest should be able to get root album', async () => {
        const result = await getAlbum('/');
        if (!result) throw new Error('Did not receive album');
    });
});

describe('getAlbumAndChildren()', () => {
    test('Invalid Album Path', async () => {
        expect.assertions(1);
        await expect(getAlbumAndChildren('not/a/valid/path')).rejects.toThrow(/path/);
    });

    test('Nonexistent Album', async () => {
        expect.assertions(1);
        // Mock out AWS method to get album
        mockDocClient.on(GetCommand).resolves({});
        const result = await getAlbumAndChildren('/1899/01-01/');
        expect(result).toBeUndefined();
    });

    test("Guest shouldn't be able to get unpublished child albums", async () => {
        // Mock out AWS method to get album
        mockDocClient.on(GetCommand).resolves({ Item: mockYearAlbum });
        // Mock out AWS method to get children
        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
            .resolves({ Items: mockDayAlbums, Count: mockDayAlbums.length });
        const album = await getAlbumAndChildren('/2001/');
        if (!album) throw new Error('Did not receive album');
        if (!findChild(album.children, '01-01')) throw new Error('Expected child 01-01');
        if (!findChild(album.children, '01-02')) throw new Error('Expected child 01-02');
        if (findChild(album.children, '01-03')) throw new Error('Did not expect child 01-03');
        if (!findChild(album.children, '01-04')) throw new Error('Expected child 01-04');
    });

    test('Admin should be able to get unpublished child albums', async () => {
        // Mock out AWS method to get album
        mockDocClient.on(GetCommand).resolves({ Item: mockYearAlbum });
        // Mock out AWS method to get children
        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
            .resolves({ Items: mockDayAlbums, Count: mockDayAlbums.length });
        const includeUnpublishedAlbums = true;
        const album = await getAlbumAndChildren('/2001/', includeUnpublishedAlbums);
        if (!album) throw new Error('Did not receive album');
        if (!findChild(album.children, '01-01')) throw new Error('Expected child 01-01');
        if (!findChild(album.children, '01-02')) throw new Error('Expected child 01-02');
        if (!findChild(album.children, '01-03')) throw new Error('Expected child 01-03');
        if (!findChild(album.children, '01-04')) throw new Error('Expected child 01-04');
    });

    test('Guest should be able to get root album', async () => {
        // Mock out AWS method to get children
        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: mockYearAlbums, Count: mockYearAlbums.length });

        const album = await getAlbumAndChildren('/');

        if (!album) throw new Error('Did not receive album');
        expect(album?.path).toBe('/');
        expect(album?.parentPath).toBe('');
        expect(album?.itemName).toBe('/');

        const children = album?.children;
        if (!children) throw new Error('Did not receive children');
        expect(children[0]?.path).toBe('/2001/');
        expect(children[0]?.parentPath).toBe('/');
        expect(children[0]?.itemName).toBe('2001');
        expect(children[1]?.itemName).toBe('2002');
        expect((children[1] as AlbumItem)?.published).toBe(true);
        if (findChild(children, '2003')) throw new Error('Did not expect unpublished child 2003');

        if (!!album.next?.path) throw new Error('Was not expecting a next album on root');
        if (!!album.prev?.path) throw new Error('Was not expecting a prev album on root');
    });

    test('Guest should not be able to get unpublished week album', async () => {
        // Mock out AWS method to get album
        mockDocClient.on(GetCommand).resolves({
            Item: {
                parentPath: '/2001/',
                itemName: '01-01',
                itemType: 'album',
                updatedOn: '2001-01-01T23:59:59.999Z',
                description: 'xxx',
            } satisfies AlbumItem,
        });
        const album = await getAlbumAndChildren('/2001/01-01/');
        if (album) throw new Error('Expected to not retrieve album');
    });

    test('Admin should be able to get unpublished week album', async () => {
        // Mock out AWS method to get album
        mockDocClient.on(GetCommand).resolves({
            Item: {
                parentPath: '/2001/',
                itemName: '01-01',
                itemType: 'album',
                updatedOn: '2001-01-01T23:59:59.999Z',
            } satisfies AlbumItem,
        });
        // Mock out AWS method to get children and peers (for next/prev)
        mockDocClient.on(QueryCommand).resolves({});
        const includeUnpublishedAlbums = true;
        const album = await getAlbumAndChildren('/2001/01-01/', includeUnpublishedAlbums);
        if (!album) throw new Error('Did not receive album');
        if (!!album.children) throw new Error('Received unexpected children');
        expect(album.path).toBe('/2001/01-01/');
    });

    test('Guest should be able to get published week album', async () => {
        // Mock out AWS method to get album
        mockDocClient.on(GetCommand).resolves({
            Item: {
                parentPath: '/2001/',
                itemName: '01-01',
                itemType: 'album',
                updatedOn: '2001-01-01T23:59:59.999Z',
                description: 'xxx',
                published: true,
            } satisfies AlbumItem,
        });
        // Mock out AWS method to get children and peers (for next/prev)
        mockDocClient.on(QueryCommand).resolves({});
        const album = await getAlbumAndChildren('/2001/01-01/');
        if (!album) throw new Error('Did not receive album');
        if (!!album.children) throw new Error('Received unexpected children');
        expect(album.path).toBe('/2001/01-01/');
        expect(album.description).toBe('xxx');
    });

    test('Should be able to get images', async () => {
        // Mock out AWS method to get album
        mockDocClient.on(GetCommand).resolves({ Item: mockDayAlbum });
        // Mock out AWS method to get children
        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/01-01/' } })
            .resolves({ Items: mockImages, Count: mockImages.length });
        // Mock out AWS method to get peers (for next/prev)
        mockDocClient.on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } }).resolves({});

        const album = await getAlbumAndChildren('/2001/01-01/');
        if (!album) throw new Error('Did not receive album');
        const children = album.children as ImageItem[];
        if (!children) throw new Error('Did not receive children');
        expect(children[0]?.path).toBe('/2001/01-01/image1.jpg');
        expect(children[0]?.itemName).toBe('image1.jpg');
        expect(children[0]?.versionId).toBe('123456789');
        expect(children[0]?.title).toBe('Title 1');
        expect(children[0]?.description).toBe('Description 1');
        expect(children[0]?.updatedOn).toBe('2001-01-01T23:59:59.999Z');
        expect(children[0]?.versionId).toBe('123456789');
        expect(children[0]?.tags).toContain('image1_tag1');
        expect(children[1]?.path).toBe('/2001/01-01/image2.jpg');
        expect(children[1]?.itemName).toBe('image2.jpg');
        expect(children[1]?.title).toBe('Title 2');
        expect(children[1]?.description).toBe('Description 2');
        expect(children[1]?.tags).toContain('image2_tag2');
        expect(children[2]?.tags).toContain('image3_tag3');
        if (!!album.next?.path) throw new Error('Was not expecting a next album');
        if (!!album.prev?.path) throw new Error('Was not expecting a prev album');
    });

    describe('Prev & Next', () => {
        test('Guest - No Prev', async () => {
            const albumName = '01-01';
            // Mock out AWS method to get album
            mockDocClient.on(GetCommand).resolves({ Item: mockDayAlbum });
            // Mock out AWS method to get peers (for next/prev)
            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
                .resolves({ Items: mockDayAlbums });
            const album = await getAlbumAndChildren(`/2001/${albumName}/`);
            if (!album) throw new Error('Did not receive album');
            if (!!album?.prev) throw new Error('Not expecting a prev');
            if (!album?.next) throw new Error('Expecting a next');
            expect(album?.next?.path).toBe('/2001/01-02/');
        });

        test('Admin - No Prev', async () => {
            const albumName = '01-01';
            // Mock out AWS method to get album
            mockDocClient.on(GetCommand).resolves({ Item: mockDayAlbum });
            // Mock out AWS method to get peers (for next/prev)
            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
                .resolves({ Items: mockDayAlbums });
            const includeUnpublishedAlbums = true;
            const album = await getAlbumAndChildren(`/2001/${albumName}/`, includeUnpublishedAlbums);
            if (!!album?.prev) throw new Error('Not expecting a prev');
            expect(album?.next?.path).toBe('/2001/01-02/');
        });

        test('Guest - Next Skips Unpublished', async () => {
            const albumName = '01-02';
            // Mock out AWS method to get album
            mockDocClient.on(GetCommand).resolves({ Item: mockDayAlbum });
            // Mock out AWS method to get peers (for next/prev)
            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
                .resolves({ Items: mockDayAlbums });
            const album = await getAlbumAndChildren(`/2001/${albumName}/`);
            expect(album?.prev?.path).toBe('/2001/01-01/');
            expect(album?.next?.path).toBe('/2001/01-04/');
        });

        test("Admin - Next Doesn't Skip Unpublished", async () => {
            const albumName = '01-02';
            // Mock out AWS method to get album
            mockDocClient.on(GetCommand).resolves({ Item: mockDayAlbum });
            // Mock out AWS method to get peers (for next/prev)
            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
                .resolves({ Items: mockDayAlbums });
            const includeUnpublishedAlbums = true;
            const album = await getAlbumAndChildren(`/2001/${albumName}/`, includeUnpublishedAlbums);
            expect(album?.prev?.path).toBe('/2001/01-01/');
            expect(album?.next?.path).toBe('/2001/01-03/');
        });

        test('Guest - Both Prev & Next', async () => {
            const albumName = '01-02';
            // Mock out AWS method to get album
            mockDocClient.on(GetCommand).resolves({ Item: mockDayAlbum });
            // Mock out AWS method to get peers (for next/prev)
            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
                .resolves({ Items: mockDayAlbums });
            const album = await getAlbumAndChildren(`/2001/${albumName}/`);
            if (!album) throw new Error('Did not receive album');
            if (!album.prev) throw new Error('Expected a prev');
            expect(album?.prev?.path).toBe('/2001/01-01/');
            if (!album.next) throw new Error('Expected a next');
            expect(album?.next?.path).toBe('/2001/01-04/');
        });

        test('Admin - Both Prev & Next', async () => {
            const albumName = '01-03';
            // Mock out AWS method to get album
            mockDocClient.on(GetCommand).resolves({ Item: mockDayAlbum });
            // Mock out AWS method to get peers (for next/prev)
            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
                .resolves({ Items: mockDayAlbums });
            const includeUnpublishedAlbums = true;
            const album = await getAlbumAndChildren(`/2001/${albumName}/`, includeUnpublishedAlbums);
            if (!album) throw new Error('Did not receive album');
            if (!album.prev) throw new Error('Expected a prev');
            expect(album?.prev?.path).toBe('/2001/01-02/');
            if (!album.next) throw new Error('Expected a next');
            expect(album?.next?.path).toBe('/2001/01-04/');
        });

        test('Guest - Prev Skips Unpublished', async () => {
            const albumName = '01-04';
            // Mock out AWS method to get album
            mockDocClient.on(GetCommand).resolves({ Item: mockDayAlbum });
            // Mock out AWS method to get peers (for next/prev)
            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
                .resolves({ Items: mockDayAlbums });
            const album = await getAlbumAndChildren(`/2001/${albumName}/`);
            expect(album?.prev?.path).toBe('/2001/01-02/');
        });

        test("Admin - Prev Doesn't Skip Unpublished", async () => {
            const albumName = '01-04';
            // Mock out AWS method to get album
            mockDocClient.on(GetCommand).resolves({ Item: mockDayAlbum });
            // Mock out AWS method to get peers (for next/prev)
            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
                .resolves({ Items: mockDayAlbums });
            const includeUnpublishedAlbums = true;
            const album = await getAlbumAndChildren(`/2001/${albumName}/`, includeUnpublishedAlbums);
            expect(album?.prev?.path).toBe('/2001/01-03/');
        });

        test('No Next', async () => {
            const albumName = '01-04';
            // Mock out AWS method to get album
            mockDocClient.on(GetCommand).resolves({ Item: mockDayAlbum });
            // Mock out AWS method to get peers (for next/prev)
            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
                .resolves({ Items: mockDayAlbums });
            const album = await getAlbumAndChildren(`/2001/${albumName}/`);
            if (!!album?.next) throw new Error('Not expecting a next');
        });
    });
});

/** Find child album or image by name */
function findChild(
    children: (AlbumItem | ImageItem)[] | undefined,
    childName: string,
): (AlbumItem | ImageItem) | undefined {
    if (!children) throw new Error('Did not receive children');
    return children.find((child) => child.itemName === childName);
}

/** Parent album of the mock images below */
const mockDayAlbum: AlbumItem = {
    parentPath: '/2001/',
    itemName: '01-01',
    itemType: 'album',
    updatedOn: '2001-01-01T23:59:59.999Z',
    published: true,
};

/** Child imgages of the mock day album above */
const mockImages: ImageItem[] = [
    {
        itemName: 'image1.jpg',
        itemType: 'image',
        parentPath: '/2001/01-01/',
        versionId: '123456789',
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
        versionId: '123456789',
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
        versionId: '123456789',
        title: 'Title 3',
        description: 'Description 3',
        updatedOn: '2001-01-01T23:59:59.999Z',
        dimensions: { width: 4032, height: 3024 },
        tags: ['image3_tag1', 'image3_tag2', 'image3_tag3'],
    },
];

/** Parent album of the mock day albums below */
const mockYearAlbum: AlbumItem = {
    parentPath: '/',
    itemName: '2001',
    itemType: 'album',
    updatedOn: '2001-01-01T23:59:59.999Z',
    published: true,
};

/** Child albums of the mock year album above */
const mockDayAlbums: AlbumItem[] = [
    {
        itemName: '01-01',
        itemType: 'album',
        parentPath: '/2001/',
        description: 'Description 1',
        updatedOn: '2001-01-01T23:59:59.999Z',
        published: true,
    },
    {
        itemName: '01-02',
        itemType: 'album',
        parentPath: '/2001/',
        description: 'Description 2',
        updatedOn: '2001-02-01T23:59:59.999Z',
        published: true,
    },
    {
        itemName: '01-03',
        itemType: 'album',
        parentPath: '/2001/',
        description: 'Description 3',
        updatedOn: '2001-03-01T23:59:59.999Z',
        published: false,
    },
    {
        itemName: '01-04',
        itemType: 'album',
        parentPath: '/2001/',
        description: 'Description 4',
        updatedOn: '2001-04-01T23:59:59.999Z',
        published: true,
    },
];

const mockYearAlbums: AlbumItem[] = [
    {
        itemName: '2001',
        itemType: 'album',
        parentPath: '/',
        description: 'Description 1',
        updatedOn: '2001-01-01T23:59:59.999Z',
        published: true,
    },
    {
        itemName: '2002',
        itemType: 'album',
        parentPath: '/',
        description: 'Description 2',
        updatedOn: '2002-02-01T23:59:59.999Z',
        published: true,
    },
    {
        itemName: '2003',
        itemType: 'album',
        parentPath: '/',
        description: 'Description 3',
        updatedOn: '2003-03-01T23:59:59.999Z',
        published: false,
    },
    {
        itemName: '2004',
        itemType: 'album',
        parentPath: '/',
        description: 'Description 4',
        updatedOn: '2004-04-01T23:59:59.999Z',
        published: true,
    },
];
