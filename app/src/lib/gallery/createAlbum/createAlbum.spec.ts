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
        '/', // cannot create root album
        '/invalid/path',
        'another bad path',
        '/2001/1231/', // no hyphen
        '2020/12-31/', // no starting slash
        '/2020/12-31', // no trailing slash
        '/2001/00-01/', // invalid month
        '/2020/13-01/', // invalid month
        '/2020/01-00/', // invalid day
        '/2020/01-32/', // invalid day
        '/2020/01-31/image.jpg', // image
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
