import { setTestEnv } from '../../lambda_utils/Env';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { deleteAlbum } from './deleteAlbum';

const mockDocClient = mockClient(DynamoDBDocumentClient);
setTestEnv({ GALLERY_ITEM_DDB_TABLE: 'notRealTable' });

afterEach(() => {
    mockDocClient.reset();
});

describe('Invalid Paths', () => {
    const paths = [
        '',
        '/', // can't delete root album
        'adf',
        '2000',
        '/2000',
        '2000/',
        '2000/12-31',
        '/2000/12-31/image',
        '2000/12-31/image.jpg',
        '/2000/12-31/image.jpg',
    ];
    paths.forEach((path) => {
        test(`Path should be invalid: [${path}]`, async () => {
            await expect(deleteAlbum(path)).rejects.toThrow(/malformed/i);
            expect(mockDocClient.commandCalls(DeleteCommand).length).toBe(0);
        });
    });
});

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
