import { mockClient } from 'aws-sdk-client-mock';
import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getLatestAlbum } from './getLatestAlbum';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

test('Get Album', async () => {
    expect.assertions(4);

    const parentPath = '/2001/12-31/';
    const itemName = '12-31';
    const updatedOn = '2001-12-31T23:59:59Z';

    // Mock out the AWS method
    mockDocClient.on(QueryCommand).resolves({
        Items: [
            {
                itemName: itemName,
                parentPath: parentPath,
                updatedOn: updatedOn,
            },
        ],
    });

    const result = await getLatestAlbum();
    const album = result?.album;
    expect(album).toBeDefined();
    expect(album?.itemName).toBe(itemName);
    expect(album?.parentPath).toBe(parentPath);
    expect(album?.updatedOn).toBe(updatedOn);
});

test('Get Nonexistent Album', async () => {
    expect.assertions(1);

    // Mock out the AWS method
    mockDocClient.on(QueryCommand).resolves({
        Items: [],
    });

    const result = await getLatestAlbum();
    expect(result).toBeUndefined();
});
