import { getAlbum } from './getAlbum';
import { mockClient } from 'aws-sdk-client-mock';
import { GetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const mockDocClient = mockClient(DynamoDBDocumentClient);
const tableName = 'NotARealTableName';

test('Get Album', async () => {
    expect.assertions(3);

    const albumPath = '/not/a/real/album';
    const uploadTimeStamp = 1541787209;

    // Mock out the AWS method
    mockDocClient.on(GetCommand).resolves({
        Item: { albumID: albumPath, uploadTimeStamp: uploadTimeStamp },
    });

    const result = await getAlbum(tableName, albumPath);

    expect(result).toBeDefined();
    expect(result?.albumID).toBe(albumPath);
    expect(result?.uploadTimeStamp).toBe(uploadTimeStamp);

    mockDocClient.reset();
});

test('Get Nonexistent Album', async () => {
    expect.assertions(1);

    // Mock out the AWS method
    mockDocClient.on(GetCommand).resolves({});

    const result = await getAlbum(tableName, '/not/a/real/album');
    expect(result).toBeUndefined();

    mockDocClient.reset();
});
