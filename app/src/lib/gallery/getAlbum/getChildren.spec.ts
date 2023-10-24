import { mockClient } from 'aws-sdk-client-mock';
import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getChildren } from './getChildren';

const mockDocClient = mockClient(DynamoDBDocumentClient);
const tableName = 'NotARealTableName';
const albumId = '/not/a/real/album';

test('Get Children', async () => {
    expect.assertions(5);

    // Mock out the AWS method
    mockDocClient.on(QueryCommand).resolves({
        Items: [{ albumID: '/2001/12-31', uploadTimeStamp: 1541787209 }],
        Count: 1,
        ScannedCount: 1,
    });

    const result = await getChildren(tableName, albumId);
    expect(result).toBeDefined();
    if (!!result) {
        expect(result[0]).toBeDefined();
        expect(result[0].albumID).toBeDefined();
        expect(result[0].albumID).toBe('/2001/12-31');
        expect(result[0].uploadTimeStamp).toBe(1541787209);
    }

    mockDocClient.reset();
});
