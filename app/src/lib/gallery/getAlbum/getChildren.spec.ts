import { mockClient } from 'aws-sdk-client-mock';
import { QueryCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { setTestEnv } from '../../lambda_utils/Env';
import { getChildren } from './getChildren';

const mockDocClient = mockClient(DynamoDBDocumentClient);
setTestEnv({ GALLERY_ITEM_DDB_TABLE: 'notRealTable' });

//
// TEST SETUP AND TEARDOWN
//

afterEach(() => {
    mockDocClient.reset();
});

//
// TESTS
//

test('Get Children', async () => {
    expect.assertions(5);

    // Mock out the AWS method
    const albumPath = '/2001/12-31/';
    mockDocClient.on(QueryCommand).resolves({
        Items: [{ albumID: albumPath, uploadTimeStamp: 1541787209 }],
        Count: 1,
        ScannedCount: 1,
    });

    const result = await getChildren(albumPath);
    expect(result).toBeDefined();
    if (!!result) {
        expect(result[0]).toBeDefined();
        expect(result[0].albumID).toBeDefined();
        expect(result[0].albumID).toBe(albumPath);
        expect(result[0].uploadTimeStamp).toBe(1541787209);
    }
});
