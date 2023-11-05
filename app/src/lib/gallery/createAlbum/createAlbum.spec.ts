import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createAlbum } from './createAlbum';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

test('Create Album - Happy Path', async () => {
    expect.assertions(1);

    // Mock the AWS command to create the album
    mockDocClient.on(PutCommand).resolves(mockSuccessResponse);
    await expect(createAlbum('/2001/')).resolves.not.toThrow();
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
            await expect(createAlbum(albumPath)).rejects.toThrow(/path/);
        });
    });
});

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
