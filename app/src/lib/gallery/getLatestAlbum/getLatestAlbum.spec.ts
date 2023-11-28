import { mockClient } from 'aws-sdk-client-mock';
import { QueryCommand, DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getLatestAlbum } from './getLatestAlbum';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

test('Get Latest Album', async () => {
    const parentPath = '/2001/';
    const itemName = '12-31';
    const updatedOn = '2001-12-31T23:59:59Z';
    const thumbnailPath = '/2001/12-31/image.jpg';
    const versionId = 'FAKE_VERSION_ID';
    const crop = { x: 1, y: 2, width: 3, height: 4 };

    // Mock out the AWS method that finds the latest album
    mockDocClient.on(QueryCommand).resolves({
        Items: [
            {
                itemName,
                parentPath,
                itemType: 'album',
                updatedOn,
                thumbnail: { path: thumbnailPath },
            },
        ],
    });
    // Mock out the AWS method that gets the thumbnail image
    mockDocClient.on(GetCommand).resolves({
        Item: {
            parentPath: '/2001/12-31/',
            itemName: 'image.jpg',
            versionId,
            thumbnail: crop,
        },
    });
    const album = await getLatestAlbum();
    if (!album) throw new Error('Got no latest album');
    expect(album.path).toBe('/2001/12-31/');
    expect(album.parentPath).toBe(parentPath);
    expect(album.itemName).toBe(itemName);
    expect(album.updatedOn).toBe(updatedOn);
    expect(album.thumbnail?.path).toBe(thumbnailPath);
    expect(album.thumbnail?.versionId).toBe(versionId);
    expect(album.thumbnail?.crop).toEqual(crop);
});

test('Get Nonexistent Latest Album', async () => {
    // Mock out the AWS method that finds the latest album
    mockDocClient.on(QueryCommand).resolves({ Items: [] });
    const result = await getLatestAlbum();
    expect(result).toBeUndefined();
});
