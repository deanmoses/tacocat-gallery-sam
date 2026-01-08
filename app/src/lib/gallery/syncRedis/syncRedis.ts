import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { SCHEMA_FIELD_TYPE } from '@redis/search';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { toRedisItem, toPath } from '../../redis_utils/toRedisFromDynamo';
import { RedisClient, createRedisWriteClient, SEARCH_INDEX_NAME } from '../../redis_utils/redisClientUtils';
import { saveToRedis } from '../../redis_utils/redisMset';
import { GalleryItem } from '../galleryTypes';
import { RedisGalleryItem } from '../../redis_utils/redisTypes';

/** Sync mode: diagnose (read-only), fix (write corrections), or init (create index) */
export type SyncMode = 'diagnose' | 'fix' | 'init';

/** Result of a sync operation (diagnose or fix mode) */
export interface SyncResult {
    totalInDynamoDB: number;
    totalInRedis: number;
    inSync: number;
    missing: number;
    mismatched: number;
    durationMs: number;
}

/** Result of an init operation */
export interface InitResult {
    indexCreated: boolean;
    indexAlreadyExisted: boolean;
    durationMs: number;
}

/** Options for sync operation */
export interface SyncOptions {
    mode: SyncMode;
    /** Base64-encoded continuation token from a previous failed run */
    continuationToken?: string;
    /** Redis client (optional, for dependency injection in tests) */
    redisClient?: RedisClient;
    /** DynamoDB document client (optional, for dependency injection in tests) */
    docClient?: DynamoDBDocumentClient;
}

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 100;

/** Stats accumulated during sync */
interface SyncStats {
    totalInDynamoDB: number;
    inSync: number;
    missing: number;
    mismatched: number;
    /** Count of items logged (to limit verbose logging) */
    itemsLogged: number;
}

const MAX_ITEMS_TO_LOG = 10;

/** Result of processing a single batch */
interface BatchResult {
    checked: number;
    inSync: number;
    missing: RedisGalleryItem[];
    mismatched: RedisGalleryItem[];
}

/**
 * Sync DynamoDB to Redis.
 * Compares all items in DynamoDB to Redis and reports/fixes discrepancies.
 */
export async function syncRedis(options: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const { mode, continuationToken } = options;

    console.log(JSON.stringify({ event: 'sync_start', mode }));

    // Set up clients
    const docClient = options.docClient ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
    const redisClient = options.redisClient ?? (await createRedisWriteClient());
    const shouldCloseRedis = !options.redisClient;

    try {
        if (mode === 'fix') {
            await ensureIndexExists(redisClient);
        }

        const stats: SyncStats = {
            totalInDynamoDB: 0,
            inSync: 0,
            missing: 0,
            mismatched: 0,
            itemsLogged: 0,
        };
        let batchNumber = 0;
        let lastEvaluatedKey = decodeContinuationToken(continuationToken);

        do {
            batchNumber++;

            const { items, nextKey } = await scanDynamoBatch(docClient, lastEvaluatedKey);

            if (items.length > 0) {
                console.log(JSON.stringify({ event: 'scan_page', page: batchNumber, itemCount: items.length }));

                const batchResult = await compareBatch(items, redisClient, batchNumber, lastEvaluatedKey, stats);
                accumulateStats(stats, batchResult);

                if (mode === 'fix') {
                    await fixBatch(redisClient, batchResult);
                }

                logBatchComplete(batchNumber, batchResult);
            }

            lastEvaluatedKey = nextKey;

            if (mode === 'fix' && lastEvaluatedKey) {
                await delay(BATCH_DELAY_MS);
            }
        } while (lastEvaluatedKey);

        const durationMs = Date.now() - startTime;
        const totalInRedis = await redisClient.dbSize();
        logSyncComplete(stats, totalInRedis, durationMs);

        return {
            totalInDynamoDB: stats.totalInDynamoDB,
            totalInRedis,
            inSync: stats.inSync,
            missing: stats.missing,
            mismatched: stats.mismatched,
            durationMs,
        };
    } finally {
        if (shouldCloseRedis) {
            await redisClient.quit();
        }
    }
}

/** Ensure search index exists, throw if not */
async function ensureIndexExists(redisClient: RedisClient): Promise<void> {
    const exists = await indexExists(redisClient);
    if (!exists) {
        throw new Error('Search index does not exist. Run with mode "init" first to create it.');
    }
}

/** Decode base64 continuation token to DynamoDB key */
function decodeContinuationToken(token?: string): Record<string, unknown> | undefined {
    if (!token) return undefined;
    try {
        return JSON.parse(Buffer.from(token, 'base64').toString());
    } catch (e) {
        throw new Error(`Invalid continuation token: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** Scan a batch of items from DynamoDB */
async function scanDynamoBatch(
    docClient: DynamoDBDocumentClient,
    startKey?: Record<string, unknown>,
): Promise<{ items: GalleryItem[]; nextKey?: Record<string, unknown> }> {
    const command = new ScanCommand({
        TableName: getDynamoDbTableName(),
        ExclusiveStartKey: startKey,
        Limit: BATCH_SIZE,
    });

    const response = await docClient.send(command);
    return {
        items: (response.Items as GalleryItem[]) ?? [],
        nextKey: response.LastEvaluatedKey,
    };
}

/** Compare a batch of DynamoDB items against Redis */
async function compareBatch(
    items: GalleryItem[],
    redisClient: RedisClient,
    batchNumber: number,
    lastEvaluatedKey?: Record<string, unknown>,
    stats?: SyncStats,
): Promise<BatchResult> {
    const paths = items.map(toPath);
    const expectedItems = items.map(toRedisItem);

    const actualItems = await fetchFromRedis(redisClient, paths, batchNumber, lastEvaluatedKey);

    const result: BatchResult = { checked: items.length, inSync: 0, missing: [], mismatched: [] };

    for (let i = 0; i < items.length; i++) {
        const path = paths[i];
        const expected = expectedItems[i];
        const actual = actualItems[i];

        if (!actual) {
            result.missing.push(expected);
            if (!stats || stats.itemsLogged < MAX_ITEMS_TO_LOG) {
                console.log(JSON.stringify({ event: 'item_missing', path }));
                if (stats) stats.itemsLogged++;
            }
        } else if (!deepEqual(expected, actual)) {
            result.mismatched.push(expected);
            if (!stats || stats.itemsLogged < MAX_ITEMS_TO_LOG) {
                console.log(JSON.stringify({ event: 'item_mismatched', path }));
                if (stats) stats.itemsLogged++;
            }
        } else {
            result.inSync++;
        }
    }

    return result;
}

/** Fetch items from Redis using batch mGet */
async function fetchFromRedis(
    redisClient: RedisClient,
    paths: string[],
    batchNumber: number,
    lastEvaluatedKey?: Record<string, unknown>,
): Promise<(RedisGalleryItem | null)[]> {
    try {
        const mGetResult = await redisClient.json.mGet(paths, '$');
        return mGetResult.map((result) => {
            if (!result) return null;
            if (Array.isArray(result) && result.length > 0) {
                return result[0] as RedisGalleryItem;
            }
            return null;
        });
    } catch (e) {
        const token = lastEvaluatedKey ? Buffer.from(JSON.stringify(lastEvaluatedKey)).toString('base64') : undefined;
        console.log(
            JSON.stringify({
                event: 'batch_error',
                batch: batchNumber,
                error: e instanceof Error ? e.message : String(e),
                firstItem: paths[0],
                lastItem: paths[paths.length - 1],
                continuationToken: token,
                resumeFromStart: !token,
            }),
        );
        throw e;
    }
}

/** Write missing/mismatched items to Redis */
async function fixBatch(redisClient: RedisClient, batchResult: BatchResult): Promise<void> {
    const itemsToWrite = [...batchResult.missing, ...batchResult.mismatched];
    if (itemsToWrite.length > 0) {
        await saveToRedis(redisClient, itemsToWrite);
    }
}

/** Accumulate batch results into running stats */
function accumulateStats(stats: SyncStats, batchResult: BatchResult): void {
    stats.totalInDynamoDB += batchResult.checked;
    stats.inSync += batchResult.inSync;
    stats.missing += batchResult.missing.length;
    stats.mismatched += batchResult.mismatched.length;
}

/** Log batch completion */
function logBatchComplete(batchNumber: number, result: BatchResult): void {
    console.log(
        JSON.stringify({
            event: 'batch_complete',
            batch: batchNumber,
            checked: result.checked,
            missing: result.missing.length,
            mismatched: result.mismatched.length,
        }),
    );
}

/** Log sync completion */
function logSyncComplete(stats: SyncStats, totalInRedis: number, durationMs: number): void {
    console.log(
        JSON.stringify({
            event: 'sync_complete',
            totalInDynamoDB: stats.totalInDynamoDB,
            totalInRedis,
            missing: stats.missing,
            mismatched: stats.mismatched,
            durationMs,
        }),
    );
}

/**
 * Deep equality comparison for Redis items.
 * Handles nested objects and arrays with canonical key ordering.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;

    // Both must be arrays or both must be non-array objects
    const aIsArray = Array.isArray(a);
    const bIsArray = Array.isArray(b);
    if (aIsArray !== bIsArray) return false;

    if (aIsArray && bIsArray) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }

    if (typeof a === 'object' && typeof b === 'object') {
        const aObj = a as Record<string, unknown>;
        const bObj = b as Record<string, unknown>;
        const aKeys = Object.keys(aObj).sort();
        const bKeys = Object.keys(bObj).sort();

        if (aKeys.length !== bKeys.length) return false;
        for (let i = 0; i < aKeys.length; i++) {
            if (aKeys[i] !== bKeys[i]) return false;
            if (!deepEqual(aObj[aKeys[i]], bObj[bKeys[i]])) return false;
        }
        return true;
    }

    return false;
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initialize Redis search index.
 * Creates the search index if it doesn't exist.
 */
export async function initRedis(options: Pick<SyncOptions, 'redisClient'>): Promise<InitResult> {
    const startTime = Date.now();

    console.log(JSON.stringify({ event: 'init_start' }));

    const redisClient = options.redisClient ?? (await createRedisWriteClient());
    const shouldCloseRedis = !options.redisClient;

    try {
        const exists = await indexExists(redisClient);

        if (exists) {
            console.log(JSON.stringify({ event: 'init_complete', indexAlreadyExisted: true }));
            return {
                indexCreated: false,
                indexAlreadyExisted: true,
                durationMs: Date.now() - startTime,
            };
        }

        await createIndex(redisClient);

        console.log(JSON.stringify({ event: 'init_complete', indexCreated: true }));
        return {
            indexCreated: true,
            indexAlreadyExisted: false,
            durationMs: Date.now() - startTime,
        };
    } finally {
        if (shouldCloseRedis) {
            await redisClient.quit();
        }
    }
}

/** Check if search index exists */
async function indexExists(redisClient: RedisClient): Promise<boolean> {
    try {
        await redisClient.ft.info(SEARCH_INDEX_NAME);
        return true;
    } catch (e) {
        // Redis throws error if index doesn't exist
        if (e instanceof Error && e.message.toLowerCase().includes('unknown index')) {
            return false;
        }
        throw e;
    }
}

/** Create the search index */
async function createIndex(redisClient: RedisClient): Promise<void> {
    await redisClient.ft.create(
        SEARCH_INDEX_NAME,
        {
            '$.itemType': { type: SCHEMA_FIELD_TYPE.TAG, AS: 'itemType' },
            '$.itemNameSearchable': { type: SCHEMA_FIELD_TYPE.TEXT, AS: 'name' },
            '$.description': { type: SCHEMA_FIELD_TYPE.TEXT, AS: 'description' },
            '$.title': { type: SCHEMA_FIELD_TYPE.TEXT, AS: 'title' },
            '$.summary': { type: SCHEMA_FIELD_TYPE.TEXT, AS: 'summary' },
            '$.tags': { type: SCHEMA_FIELD_TYPE.TEXT, AS: 'tags' },
            '$.albumDate': { type: SCHEMA_FIELD_TYPE.NUMERIC, AS: 'date', SORTABLE: true },
        },
        { ON: 'JSON' },
    );
}
