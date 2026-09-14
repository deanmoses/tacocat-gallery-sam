// Registers the pure-JS SigV4a signer that the KeyValueStore API requires.
// The alternative, @aws-sdk/signature-v4-crt, is a native binary that esbuild
// cannot bundle.
import '@aws-sdk/signature-v4a';
import {
    CloudFrontKeyValueStoreClient,
    DescribeKeyValueStoreCommand,
    ListKeysCommand,
    UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import { getAlbumVersionStoreArn } from '../lambda_utils/Env';

/** Shared across warm invocations, like the DynamoDB client */
export const kvsClient = new CloudFrontKeyValueStoreClient({});

/** Keys per UpdateKeys call. Well under the API's per-call limit. */
const MAX_KEYS_PER_UPDATE = 25;

/** Attempts per chunk when another writer moves the store's ETag between reads */
const MAX_ATTEMPTS = 5;

export type KeyValueUpdates = {
    puts: Map<string, string>;
    deletes: Set<string>;
};

/**
 * Apply puts and deletes to the album version store.
 *
 * Every write must name the store's current ETag, which changes on every
 * write, so a concurrent writer (the stream Lambda and the sync Lambda, or two
 * stream shards) makes a stale write fail. That failure is retried against a
 * fresh ETag; the puts are idempotent so replaying them is safe.
 */
export async function updateKeyValues(updates: KeyValueUpdates, kvsArn = getAlbumVersionStoreArn()): Promise<void> {
    const puts = [...updates.puts].map(([Key, Value]) => ({ Key, Value }));
    const deletes = [...updates.deletes].filter((key) => !updates.puts.has(key)).map((Key) => ({ Key }));
    if (puts.length === 0 && deletes.length === 0) return;

    type Change = { put?: { Key: string; Value: string }; del?: { Key: string } };
    const changes: Change[] = [...puts.map((put) => ({ put })), ...deletes.map((del) => ({ del }))];
    let etag: string | undefined;
    for (const chunk of chunks(changes)) {
        const Puts = chunk.flatMap((c) => (c.put ? [c.put] : []));
        const Deletes = chunk.flatMap((c) => (c.del ? [c.del] : []));
        for (let attempt = 1; ; attempt++) {
            etag ??= await describeEtag(kvsArn);
            try {
                const result = await kvsClient.send(
                    new UpdateKeysCommand({
                        KvsARN: kvsArn,
                        IfMatch: etag,
                        Puts: Puts.length ? Puts : undefined,
                        Deletes: Deletes.length ? Deletes : undefined,
                    }),
                );
                etag = result.ETag;
                break;
            } catch (e) {
                if (attempt >= MAX_ATTEMPTS || !isStaleEtagError(e)) throw e;
                console.warn({
                    event: 'kvs_etag_conflict',
                    attempt,
                    error: e instanceof Error ? e.message : String(e),
                });
                etag = undefined;
            }
        }
    }
}

/** Every key in the store */
export async function listKeys(kvsArn = getAlbumVersionStoreArn()): Promise<Map<string, string>> {
    const keys = new Map<string, string>();
    let NextToken: string | undefined;
    do {
        const page = await kvsClient.send(new ListKeysCommand({ KvsARN: kvsArn, MaxResults: 50, NextToken }));
        for (const item of page.Items ?? []) {
            if (item.Key !== undefined && item.Value !== undefined) keys.set(item.Key, item.Value);
        }
        NextToken = page.NextToken;
    } while (NextToken);
    return keys;
}

async function describeEtag(kvsArn: string): Promise<string> {
    const store = await kvsClient.send(new DescribeKeyValueStoreCommand({ KvsARN: kvsArn }));
    if (!store.ETag) throw new Error(`KeyValueStore [${kvsArn}] returned no ETag`);
    return store.ETag;
}

/**
 * A write against an ETag that is no longer current. The service reports it
 * as a 412; the SDK models that as ValidationException, so check the status.
 */
function isStaleEtagError(e: unknown): boolean {
    const status = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (e as { name?: string })?.name;
    return status === 412 || status === 409 || name === 'ConflictException';
}

function chunks<T>(items: T[]): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += MAX_KEYS_PER_UPDATE) {
        result.push(items.slice(i, i + MAX_KEYS_PER_UPDATE));
    }
    return result;
}
