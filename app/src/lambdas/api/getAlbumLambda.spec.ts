import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from './getAlbumLambda';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { setVerifierForTesting } from '../../lib/lambda_utils/AuthorizationHelpers';

jest.mock('../../lib/gallery/getAlbum/getAlbum');
const mockGetAlbumAndChildren = jest.mocked(getAlbumAndChildren);

const ALBUM = { path: '/2001/12-31/', parentPath: '/2001/', itemName: '12-31', itemType: 'album' as const };

function getEvent(cookie?: string): APIGatewayProxyEvent {
    return {
        headers: cookie ? { cookie } : {},
        body: null,
        httpMethod: 'GET',
        isBase64Encoded: false,
        path: '/album/2001/12-31',
        pathParameters: { albumPath: '2001/12-31' },
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as APIGatewayProxyEvent['requestContext'],
        resource: '',
        multiValueHeaders: {},
    };
}

async function invoke(event: APIGatewayProxyEvent) {
    const result = await handler(event, {} as Context, () => undefined);
    if (!result) throw new Error('Handler returned nothing');
    return result;
}

/** What the handler asked the library to include, once verification had settled */
async function includedUnpublished(): Promise<boolean> {
    const includeUnpublishedAlbums = mockGetAlbumAndChildren.mock.calls[0]?.[1];
    if (includeUnpublishedAlbums === undefined) throw new Error('getAlbumAndChildren was not called');
    return includeUnpublishedAlbums;
}

describe('getAlbum handler', () => {
    beforeEach(() => {
        jest.spyOn(console, 'info').mockReturnValue(undefined);
        jest.spyOn(console, 'warn').mockReturnValue(undefined);
        mockGetAlbumAndChildren.mockResolvedValue(ALBUM);
    });

    afterEach(() => {
        setVerifierForTesting(undefined);
        jest.restoreAllMocks();
    });

    const payload = { sub: 'user', token_use: 'id' as const, exp: 0, iat: 0, iss: '', aud: '', auth_time: 0 };
    const accepting = { verify: jest.fn().mockResolvedValue(payload), hydrate: jest.fn() };
    const rejecting = { verify: jest.fn().mockRejectedValue(new Error('Token expired')), hydrate: jest.fn() };

    it.each([
        { name: 'no cookie', cookie: undefined, verifier: accepting, status: 'none', unpublished: false },
        {
            name: 'a cookie that fails verification',
            cookie: 'id_token=x',
            verifier: rejecting,
            status: 'invalid',
            unpublished: false,
        },
        { name: 'a verified cookie', cookie: 'id_token=x', verifier: accepting, status: 'valid', unpublished: true },
    ])('$name gets X-Auth-Status $status', async ({ cookie, verifier, status, unpublished }) => {
        setVerifierForTesting(verifier);

        const result = await invoke(getEvent(cookie));

        expect(result.statusCode).toBe(200);
        expect(result.headers?.['X-Auth-Status']).toBe(status);
        await expect(includedUnpublished()).resolves.toBe(unpublished);
    });

    it('reports the auth status on a 404 too, so an expired admin can refresh and ask again', async () => {
        setVerifierForTesting(rejecting);
        mockGetAlbumAndChildren.mockResolvedValue(undefined);

        const result = await invoke(getEvent('id_token=x'));

        expect(result.statusCode).toBe(404);
        expect(result.headers?.['X-Auth-Status']).toBe('invalid');
    });
});
