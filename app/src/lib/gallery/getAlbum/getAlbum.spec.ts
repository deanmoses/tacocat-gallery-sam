import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getAlbum } from './getAlbum';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

test('Get Album', async () => {
    expect.assertions(3);

    const albumPath = '/2001/12-31/';
    const uploadTimeStamp = 1541787209;

    // Mock out the AWS method
    mockDocClient.on(GetCommand).resolves({
        Item: { albumID: albumPath, uploadTimeStamp: uploadTimeStamp },
    });

    const result = await getAlbum(albumPath);

    expect(result).toBeDefined();
    expect(result?.albumID).toBe(albumPath);
    expect(result?.uploadTimeStamp).toBe(uploadTimeStamp);
});

test('Get Nonexistent Album', async () => {
    expect.assertions(1);

    // Mock out the AWS method
    mockDocClient.on(GetCommand).resolves({});

    const result = await getAlbum('/1900/01-01/');
    expect(result).toBeUndefined();
});

test('Get Invalid Album Path', async () => {
    expect.assertions(1);

    // Mock out the AWS method
    mockDocClient.on(GetCommand).resolves({});

    await expect(getAlbum('not/a/valid/path')).rejects.toThrow(/path/);
});
