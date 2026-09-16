import { DynamoDBStreamEvent } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { AttributeValue } from '@aws-sdk/client-dynamodb';
import {
    getParentFromPath,
    isValidDayAlbumPath,
    isValidMediaPath,
    isValidYearAlbumPath,
    toPathFromKey,
} from '../../gallery_path_utils/galleryPathUtils';
import { KeyValueUpdates } from '../../cloudfront_utils/keyValueStore';
import { getItem } from '../../dynamo_utils/ddbGet';
import { contentVersionKey, getAlbumContentVersion } from '../getAlbum/albumVersion';
import { ItemOverlay } from '../getAlbum/getAlbum';
import { Album, AlbumItem, GalleryItem } from '../galleryTypes';

/** What a DynamoDB stream batch changed: the paths, and the rows as the writes left them */
export type StreamBatch = ItemOverlay & { paths: string[] };

/**
 * Read a stream batch: the paths its records touched, deduped, and each row's
 * new image, later records winning. Deleted records carry only their key, so
 * the path is rebuilt from that.
 */
export function batchFromStream(event: DynamoDBStreamEvent): StreamBatch {
    const paths = new Set<string>();
    const items = new Map<string, GalleryItem>();
    const removed = new Set<string>();
    for (const record of event.Records ?? []) {
        const parentPath = record.dynamodb?.Keys?.['parentPath']?.S;
        const itemName = record.dynamodb?.Keys?.['itemName']?.S;
        if (!parentPath || !itemName) {
            console.warn({ event: 'album_versions_record_without_key', dynamoEvent: record.eventName });
            continue;
        }
        const path = toPathFromKey(parentPath, itemName);
        paths.add(path);
        if (record.dynamodb?.NewImage) {
            items.set(path, unmarshall(record.dynamodb.NewImage as Record<string, AttributeValue>) as GalleryItem);
            removed.delete(path);
        } else if (record.eventName === 'REMOVE') {
            items.delete(path);
            removed.add(path);
        }
    }
    return { paths: [...paths], items, removed };
}

/**
 * Work out which album versions a set of changed items can have moved, and
 * recompute those.
 *
 * What an album's response depends on:
 *  - its own record and its children's records
 *  - for a root or year album, the image record behind each child's thumbnail
 *
 * So a media item changes its day album; its year album if it is the day's
 * thumbnail (the year lists the day with it) or the year's own; and the root
 * if it is the year's, since the root lists the year with it. A year's
 * thumbnail is any image in the year, not necessarily its day's. An album
 * changes itself and its parent. The root has no record of its own, so
 * nothing lands on it directly.
 *
 * A changed album whose record is gone gets its key deleted; an album with
 * no version is served uncached until the API versions it on its next fetch.
 *
 * The batch's own rows are laid over what the table returns, so the reads can
 * be eventually consistent without a replica that has not caught up leaving a
 * version where it was.
 */
export async function computeAlbumVersionUpdates(batch: StreamBatch): Promise<KeyValueUpdates> {
    const contentPaths = new Set<string>();
    const mediaPaths: string[] = [];
    for (const path of batch.paths) {
        if (isValidMediaPath(path)) {
            contentPaths.add(getParentFromPath(path));
            mediaPaths.push(path);
        } else if (isValidDayAlbumPath(path) || isValidYearAlbumPath(path)) {
            contentPaths.add(path);
            contentPaths.add(getParentFromPath(path));
        } else {
            console.warn({ event: 'album_versions_unrecognized_path', path });
        }
    }

    // Each album is fetched once per batch, however many records touched it,
    // and the fetches run alongside each other: started here, awaited below.
    // A failure is observed at the await; the no-op handler only keeps it from
    // counting as unhandled in the meantime.
    const computed = new Map<string, Promise<{ version: string; album: Album } | undefined>>();
    const content = (albumPath: string) => {
        let pending = computed.get(albumPath);
        if (!pending) {
            pending = getAlbumContentVersion(albumPath, batch);
            pending.catch(() => undefined);
            computed.set(albumPath, pending);
        }
        return pending;
    };
    const yearThumbnails = new Map<string, Promise<string | undefined>>();
    const yearThumbnail = (yearAlbumPath: string) => {
        let pending = yearThumbnails.get(yearAlbumPath);
        if (!pending) {
            const fresh = batch.items.get(yearAlbumPath) as AlbumItem | undefined;
            pending =
                fresh || batch.removed.has(yearAlbumPath)
                    ? Promise.resolve(fresh?.thumbnail?.path)
                    : getItem<AlbumItem>(yearAlbumPath, ['thumbnail']).then((year) => year?.thumbnail?.path);
            pending.catch(() => undefined);
            yearThumbnails.set(yearAlbumPath, pending);
        }
        return pending;
    };

    for (const albumPath of contentPaths) void content(albumPath);

    // Follow a changed media item up through the thumbnails that point at it
    await Promise.all(
        mediaPaths.map(async (mediaPath) => {
            const dayAlbumPath = getParentFromPath(mediaPath);
            const yearAlbumPath = getParentFromPath(dayAlbumPath);
            const [day, yearThumbnailPath] = await Promise.all([content(dayAlbumPath), yearThumbnail(yearAlbumPath)]);
            const isDayThumbnail = day?.album.thumbnail?.path === mediaPath;
            const isYearThumbnail = yearThumbnailPath === mediaPath;
            if (isDayThumbnail || isYearThumbnail) void content(yearAlbumPath);
            if (isYearThumbnail) void content('/');
        }),
    );

    const updates: KeyValueUpdates = { puts: new Map(), deletes: new Set() };
    for (const [albumPath, pending] of computed) {
        const result = await pending;
        if (result) {
            updates.puts.set(contentVersionKey(albumPath), result.version);
        } else {
            updates.deletes.add(contentVersionKey(albumPath));
        }
    }
    return updates;
}
