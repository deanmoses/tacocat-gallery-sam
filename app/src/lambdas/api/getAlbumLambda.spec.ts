import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
    CloudFrontKeyValueStoreClient,
    DescribeKeyValueStoreCommand,
    GetKeyCommand,
    UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { handler } from './getAlbumLambda';
import { AlbumItem } from '../../lib/gallery/galleryTypes';

/**
 * When the API gives an album its first version. The edge function marks
 * every album request it handles with x-has-token and adds x-album-version
 * when the store has one, so "handled, but unversioned" is the one case the
 * origin must act on: the response went out uncached, and the next one
 * should not.
 */
const mockDocClient = mockClient(DynamoDBDocumentClient);
const mockKvs = mockClient(CloudFrontKeyValueStoreClient);
const STORE_ARN = 'arn:aws:cloudfront::123:key-value-store/abc';

const album: AlbumItem = {
    parentPath: '/2001/',
    itemName: '12-31',
    itemType: 'album',
    updatedOn: '2001-12-31T00:00:00.000Z',
    published: true,
};

beforeEach(() => {
    mockDocClient.reset();
    mockKvs.reset();
    mockDocClient.on(GetCommand).resolves({ Item: album });
    mockDocClient.on(QueryCommand).resolves({ Items: [] });
    mockKvs.on(DescribeKeyValueStoreCommand).resolves({ ETag: 'etag-1' });
    mockKvs.on(GetKeyCommand).rejects(Object.assign(new Error('no such key'), { name: 'ResourceNotFoundException' }));
    mockKvs.on(UpdateKeysCommand).resolves({ ETag: 'etag-2' });
    process.env.ALBUM_VERSION_STORE_ARN = STORE_ARN;
});

afterEach(() => {
    delete process.env.ALBUM_VERSION_STORE_ARN;
});

async function get(headers: Record<string, string>): Promise<APIGatewayProxyResult> {
    const event = {
        httpMethod: 'GET',
        path: '/album/2001/12-31',
        pathParameters: { albumPath: '2001/12-31' },
        headers,
        requestContext: { requestId: 'req-1' },
    } as unknown as APIGatewayProxyEvent;
    return (await handler(event, {} as Context, () => undefined)) as APIGatewayProxyResult;
}

test('an edge request with no version gets one from the response’s ETag, if the store still has none', async () => {
    const response = await get({ 'x-has-token': '0' });
    expect(response.statusCode).toBe(200);
    const etag = String(response.headers?.['ETag']);
    expect(mockKvs.commandCalls(UpdateKeysCommand)[0].args[0].input).toEqual({
        KvsARN: STORE_ARN,
        IfMatch: 'etag-1',
        // Prefixed: a guest's ETag can equal a version the stream Lambda later computes
        Puts: [{ Key: 'content:/2001/12-31/', Value: 'first-' + etag.replace(/"/g, '') }],
    });
});

test.each([
    ['a versioned edge request', { 'x-has-token': '0', 'x-album-version': 'v1' }],
    ['a request that did not come through the edge', {}],
])('%s leaves the store alone', async (_name, headers) => {
    const response = await get(headers);
    expect(response.statusCode).toBe(200);
    expect(mockKvs.calls()).toHaveLength(0);
});

test('where no edge cache is deployed there is nothing to write', async () => {
    delete process.env.ALBUM_VERSION_STORE_ARN;
    const response = await get({ 'x-has-token': '0' });
    expect(response.statusCode).toBe(200);
    expect(mockKvs.calls()).toHaveLength(0);
});

test('a store failure is not the response’s problem', async () => {
    mockKvs.on(DescribeKeyValueStoreCommand).rejects(new Error('AccessDenied'));
    const response = await get({ 'x-has-token': '0' });
    expect(response.statusCode).toBe(200);
});
