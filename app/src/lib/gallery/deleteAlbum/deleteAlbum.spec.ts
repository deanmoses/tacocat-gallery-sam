import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { deleteAlbum } from './deleteAlbum';

const mockDocClient = mockClient(DynamoDBDocumentClient);

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
        it(`Path should be invalid: [${path}]`, async () => {
            await expect(deleteAlbum(path)).rejects.toThrow(/malformed/i);
            expect(mockDocClient.commandCalls(DeleteCommand)).toHaveLength(0);
        });
    });
});

test('Delete Album', async () => {
    expect.assertions(1);

    // Mock the AWS method
    mockDocClient.on(DeleteCommand).resolves({});
    await deleteAlbum('/2001/');
    expect(mockDocClient.commandCalls(DeleteCommand)).toHaveLength(1);
});

test('Delete Nonexistent Album', async () => {
    expect.assertions(1);

    // Mock the AWS method
    mockDocClient.on(DeleteCommand).resolves({});
    await deleteAlbum('/1899/01-01/');
    expect(mockDocClient.commandCalls(DeleteCommand)).toHaveLength(1);
});
