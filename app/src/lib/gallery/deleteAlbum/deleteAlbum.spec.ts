import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { setTestEnv } from '../../lambda_utils/Env';
import { deleteAlbum } from './deleteAlbum';

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

test('Delete Album', async () => {
    expect.assertions(1);

    // Mock the AWS method
    mockDocClient.on(DeleteCommand).resolves({});
    const result = await deleteAlbum('/2001/');
    expect(result).toBeUndefined();
});

test('Delete Nonexistent Album', async () => {
    expect.assertions(1);

    // Mock the AWS method
    mockDocClient.on(DeleteCommand).resolves({});
    const result = await deleteAlbum('/1899/01-01/');
    expect(result).toBeUndefined();
});
