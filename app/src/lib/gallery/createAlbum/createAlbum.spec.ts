import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { createAlbum } from './createAlbum';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

describe('Should fail on invalid album path', () => {
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

it('Should fail on unknown attribute', async () => {
    await expect(createAlbum('/2001/', { unknownAttr: '' })).rejects.toThrow(/unknown/i);
});

test('Success', async () => {
    // Mock the AWS command to create album
    mockDocClient.on(PutCommand).resolves(mockSuccessResponse);
    await expect(createAlbum('/2001/')).resolves.not.toThrow();
});

test('Set Fields', async () => {
    // Mock the AWS command to create album
    mockDocClient.on(PutCommand).resolves(mockSuccessResponse);
    await expect(
        createAlbum('/2001/', {
            description: 'Description 1',
            summary: 'Summary 1',
            published: true,
        }),
    ).resolves.not.toThrow();
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
