import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { ddbDocClient } from '../../dynamo_utils/ddbClient';
import { getParentFromPath, toAlbumPath } from '../../gallery_path_utils/galleryPathUtils';
import { KeyValueUpdates, listKeys, updateKeyValues } from '../../cloudfront_utils/keyValueStore';
import { contentVersionKey, getAlbumContentVersion, getAlbumNavVersion, navVersionKey } from '../getAlbum/albumVersion';

export interface SyncAlbumVersionsOptions {
    /** Resume after this album path, from a previous run's nextStartAfter */
    startAfter?: string;
    /** Milliseconds left before the Lambda is killed */
    remainingMs?: () => number;
}

export interface SyncAlbumVersionsResult {
    albumsInDynamoDB: number;
    albumsVersioned: number;
    keysWritten: number;
    keysDeleted: number;
    /** Present when the run stopped early; pass it back as startAfter */
    nextStartAfter?: string;
    durationMs: number;
}

/** Versions computed between writes to the store */
const FLUSH_EVERY = 25;

/** Stop computing and flush when less than this is left on the clock */
const RESERVE_MS = 60_000;

/**
 * Recompute every album's version from DynamoDB and write it to the store.
 *
 * For bootstrapping an empty store and for repairing one after the stream
 * Lambda dropped a batch. Each album costs the same DynamoDB reads as a
 * getAlbum call, so a large gallery will not finish inside one Lambda run;
 * the result then carries a nextStartAfter to resume from. Keys for albums
 * that no longer exist are removed at the end of a complete run.
 */
export async function syncAlbumVersions(options: SyncAlbumVersionsOptions = {}): Promise<SyncAlbumVersionsResult> {
    const startTime = Date.now();
    const remainingMs = options.remainingMs ?? (() => Infinity);
    console.info({ event: 'album_versions_sync_started', startAfter: options.startAfter });

    const albumPaths = await listAlbumPaths();
    const parents = new Set(albumPaths.filter((p) => p !== '/').map(getParentFromPath));
    const stats = { albumsVersioned: 0, keysWritten: 0, keysDeleted: 0 };
    let pending: KeyValueUpdates = { puts: new Map(), deletes: new Set() };
    const flush = async () => {
        await updateKeyValues(pending);
        stats.keysWritten += pending.puts.size;
        stats.keysDeleted += pending.deletes.size;
        pending = { puts: new Map(), deletes: new Set() };
    };

    const startIndex = options.startAfter ? albumPaths.indexOf(options.startAfter) + 1 : 0;
    for (let i = startIndex; i < albumPaths.length; i++) {
        if (remainingMs() < RESERVE_MS) {
            await flush();
            const nextStartAfter = albumPaths[i - 1];
            console.warn({ event: 'album_versions_sync_out_of_time', ...stats, nextStartAfter });
            return {
                albumsInDynamoDB: albumPaths.length,
                ...stats,
                nextStartAfter,
                durationMs: Date.now() - startTime,
            };
        }
        const albumPath = albumPaths[i];
        const result = await getAlbumContentVersion(albumPath);
        if (result) pending.puts.set(contentVersionKey(albumPath), result.version);
        else pending.deletes.add(contentVersionKey(albumPath));
        stats.albumsVersioned++;
        if (pending.puts.size + pending.deletes.size >= FLUSH_EVERY) await flush();
    }
    for (const parentPath of parents) {
        pending.puts.set(navVersionKey(parentPath), await getAlbumNavVersion(parentPath));
    }
    await flush();

    // A complete pass from the start knows every key that should exist
    if (startIndex === 0) {
        const expected = new Set([...albumPaths.map(contentVersionKey), ...[...parents].map(navVersionKey)]);
        for (const key of (await listKeys()).keys()) {
            if (!expected.has(key)) pending.deletes.add(key);
        }
        await flush();
    }

    const durationMs = Date.now() - startTime;
    console.info({ event: 'album_versions_sync_complete', albumsInDynamoDB: albumPaths.length, ...stats, durationMs });
    return { albumsInDynamoDB: albumPaths.length, ...stats, durationMs };
}

/** Every album path in the gallery, root included, in a stable order */
async function listAlbumPaths(): Promise<string[]> {
    const paths: string[] = ['/'];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
        const page = await ddbDocClient.send(
            new ScanCommand({
                TableName: getDynamoDbTableName(),
                FilterExpression: 'itemType = :album',
                ExpressionAttributeValues: { ':album': 'album' },
                ProjectionExpression: 'parentPath, itemName',
                ExclusiveStartKey,
            }),
        );
        for (const item of (page.Items ?? []) as { parentPath: string; itemName: string }[]) {
            paths.push(toAlbumPath(item.parentPath, item.itemName));
        }
        ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return paths.sort();
}
