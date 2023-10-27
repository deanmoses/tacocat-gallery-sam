import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createAlbum } from './createAlbum';

const mockDocClient = mockClient(DynamoDBDocumentClient);
const tableName = 'NotARealTableName';

const mockSuccessResponse = {
    $metadata: {
        httpStatusCode: 200,
        requestId: 'UD52NC2FIMCCCOESNI53JF59PFVV4KQNSO5AEMVJF66Q9ASUAAJG',
        extendedRequestId: undefined,
        cfId: undefined,
        attempts: 1,
        totalRetryDelay: 0,
    },
};

const expectedSuccessResponse = {
    httpStatusCode: 200,
    requestId: 'UD52NC2FIMCCCOESNI53JF59PFVV4KQNSO5AEMVJF66Q9ASUAAJG',
    extendedRequestId: undefined,
    cfId: undefined,
    attempts: 1,
    totalRetryDelay: 0,
};

//
// TEST SETUP AND TEARDOWN
//

afterEach(() => {
    mockDocClient.reset();
});

//
// TESTS
//

test('Create Album - Happy Path', async () => {
    expect.assertions(2);

    // Mock the AWS method
    mockDocClient.on(PutCommand).resolves(mockSuccessResponse);
    const createResult = await createAlbum(tableName, '/2001/');
    expect(createResult).toBeDefined();
    expect(createResult).toMatchObject(expectedSuccessResponse);
});

describe('Create Album - Invalid Path', () => {
    const badAlbumPaths = [
        '/invalid/path',
        'another bad path',
        '/2001/0000',
        '/2020/12-31',
        '/2020/13-01/',
        '/2020/01-32',
    ];
    badAlbumPaths.forEach((albumPath) => {
        test(`invalid path: [${albumPath}]`, async () => {
            await expect(createAlbum(tableName, albumPath)).rejects.toThrow(/path/);
        });
    });
});
