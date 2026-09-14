import { mockClient } from 'aws-sdk-client-mock';
import {
    CloudFrontKeyValueStoreClient,
    DescribeKeyValueStoreCommand,
    ListKeysCommand,
    UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import { listKeys, updateKeyValues } from './keyValueStore';

const mockKvs = mockClient(CloudFrontKeyValueStoreClient);
const arn = 'arn:aws:cloudfront::123:key-value-store/abc';

beforeEach(() => {
    mockKvs.reset();
    mockKvs.on(DescribeKeyValueStoreCommand).resolves({ ETag: 'etag-1' });
    mockKvs.on(UpdateKeysCommand).resolves({ ETag: 'etag-2' });
});

describe('updateKeyValues', () => {
    test('does nothing when there is nothing to write', async () => {
        await updateKeyValues({ puts: new Map(), deletes: new Set() }, arn);
        expect(mockKvs.calls()).toHaveLength(0);
    });

    test('writes puts and deletes against the current ETag', async () => {
        await updateKeyValues({ puts: new Map([['a', '1']]), deletes: new Set(['b']) }, arn);
        const update = mockKvs.commandCalls(UpdateKeysCommand)[0].args[0].input;
        expect(update).toEqual({
            KvsARN: arn,
            IfMatch: 'etag-1',
            Puts: [{ Key: 'a', Value: '1' }],
            Deletes: [{ Key: 'b' }],
        });
    });

    test('a key that is both put and deleted is put', async () => {
        await updateKeyValues({ puts: new Map([['a', '1']]), deletes: new Set(['a']) }, arn);
        const update = mockKvs.commandCalls(UpdateKeysCommand)[0].args[0].input;
        expect(update.Deletes).toBeUndefined();
    });

    test('chunks large updates and chains ETags without re-describing', async () => {
        const puts = new Map(Array.from({ length: 60 }, (_, i) => [`k${i}`, `v${i}`]));
        await updateKeyValues({ puts, deletes: new Set() }, arn);
        expect(mockKvs.commandCalls(DescribeKeyValueStoreCommand)).toHaveLength(1);
        const updates = mockKvs.commandCalls(UpdateKeysCommand).map((call) => call.args[0].input);
        expect(updates.map((u) => u.Puts?.length)).toEqual([25, 25, 10]);
        expect(updates.map((u) => u.IfMatch)).toEqual(['etag-1', 'etag-2', 'etag-2']);
    });

    test('retries a stale ETag with a fresh one', async () => {
        const stale = Object.assign(new Error('PreconditionFailed'), { $metadata: { httpStatusCode: 412 } });
        mockKvs.on(UpdateKeysCommand).rejectsOnce(stale).resolves({ ETag: 'etag-3' });
        mockKvs.on(DescribeKeyValueStoreCommand).resolvesOnce({ ETag: 'etag-1' }).resolves({ ETag: 'etag-9' });
        await updateKeyValues({ puts: new Map([['a', '1']]), deletes: new Set() }, arn);
        const updates = mockKvs.commandCalls(UpdateKeysCommand).map((call) => call.args[0].input);
        expect(updates.map((u) => u.IfMatch)).toEqual(['etag-1', 'etag-9']);
    });

    test('any other error propagates', async () => {
        mockKvs.on(UpdateKeysCommand).rejects(new Error('AccessDenied'));
        await expect(updateKeyValues({ puts: new Map([['a', '1']]), deletes: new Set() }, arn)).rejects.toThrow(
            'AccessDenied',
        );
    });
});

describe('listKeys', () => {
    test('follows pagination', async () => {
        mockKvs
            .on(ListKeysCommand)
            .resolvesOnce({ Items: [{ Key: 'a', Value: '1' }], NextToken: 'more' })
            .resolves({ Items: [{ Key: 'b', Value: '2' }] });
        expect(await listKeys(arn)).toEqual(
            new Map([
                ['a', '1'],
                ['b', '2'],
            ]),
        );
    });
});
