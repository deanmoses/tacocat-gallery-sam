import { mockClient } from 'aws-sdk-client-mock';
import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getLatestAlbum } from './getLatestAlbum';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

test('Get Latest Album', async () => {
    const parentPath = '/2001/';
    const itemName = '12-31';
    const updatedOn = '2001-12-31T23:59:59Z';

    // Mock out the AWS method that finds the latest album
    mockDocClient.on(QueryCommand).resolves({
        Items: [
            {
                itemName: itemName,
                parentPath: parentPath,
                itemType: 'album',
                updatedOn: updatedOn,
            },
        ],
    });
    const album = await getLatestAlbum();
    if (!album) throw new Error('Got no latest album');
    expect(album.path).toBe('/2001/12-31/');
    expect(album.parentPath).toBe(parentPath);
    expect(album.itemName).toBe(itemName);
    expect(album.updatedOn).toBe(updatedOn);
});

test('Get Nonexistent Latest Album', async () => {
    // Mock out the AWS method that finds the latest album
    mockDocClient.on(QueryCommand).resolves({ Items: [] });
    const result = await getLatestAlbum();
    expect(result).toBeUndefined();
});
