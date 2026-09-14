import { DynamoDBStreamEvent } from 'aws-lambda';
import {
    getParentFromPath,
    isValidDayAlbumPath,
    isValidMediaPath,
    isValidYearAlbumPath,
} from '../../gallery_path_utils/galleryPathUtils';
import { KeyValueUpdates } from '../../cloudfront_utils/keyValueStore';
import { contentVersionKey, getAlbumContentVersion, getAlbumNavVersion, navVersionKey } from '../getAlbum/albumVersion';
import { Album } from '../galleryTypes';

/**
 * The gallery paths whose records a DynamoDB stream batch touched, deduped.
 * Deleted records carry only their key, so the path is rebuilt from that:
 * album names never have an extension, so a name with one is a media item.
 */
export function changedPathsFromStream(event: DynamoDBStreamEvent): string[] {
    const paths = new Set<string>();
    for (const record of event.Records ?? []) {
        const parentPath = record.dynamodb?.Keys?.['parentPath']?.S;
        const itemName = record.dynamodb?.Keys?.['itemName']?.S;
        if (!parentPath || !itemName) {
            console.warn({ event: 'album_versions_record_without_key', dynamoEvent: record.eventName });
            continue;
        }
        const path = `${parentPath}${itemName}`;
        paths.add(isValidMediaPath(path) ? path : `${path}/`);
    }
    return [...paths];
}

/**
 * Work out which album versions a set of changed items can have moved, and
 * recompute those.
 *
 * What an album's response depends on:
 *  - its own record and its children's records
 *  - for a root or year album, the image record behind each child's thumbnail
 *  - for prev/next, its parent's child list
 *
 * So a media item changes its day album, and its year album only if it is
 * that day album's thumbnail, and the root only if it is the year's thumbnail
 * too. An album changes itself, its parent, and its parent's nav version. The
 * root has no record of its own, so nothing lands on it directly.
 *
 * A changed album whose record is gone gets its keys deleted; an album with
 * no version is served uncached until something under it changes again, or
 * SyncAlbumVersions runs.
 */
export async function computeAlbumVersionUpdates(changedPaths: string[]): Promise<KeyValueUpdates> {
    const contentPaths = new Set<string>();
    const navParents = new Set<string>();
    const mediaPaths: string[] = [];
    for (const path of changedPaths) {
        if (isValidMediaPath(path)) {
            contentPaths.add(getParentFromPath(path));
            mediaPaths.push(path);
        } else if (isValidDayAlbumPath(path) || isValidYearAlbumPath(path)) {
            const parentPath = getParentFromPath(path);
            contentPaths.add(path);
            contentPaths.add(parentPath);
            navParents.add(parentPath);
        } else {
            console.warn({ event: 'album_versions_unrecognized_path', path });
        }
    }

    // Each album is fetched once per batch, however many records touched it
    const computed = new Map<string, { version: string; album: Album } | undefined>();
    const content = async (albumPath: string) => {
        if (!computed.has(albumPath)) computed.set(albumPath, await getAlbumContentVersion(albumPath));
        return computed.get(albumPath);
    };

    for (const albumPath of contentPaths) await content(albumPath);

    // Follow a changed media item up through the thumbnails that point at it
    for (const mediaPath of mediaPaths) {
        const dayAlbumPath = getParentFromPath(mediaPath);
        const yearAlbumPath = getParentFromPath(dayAlbumPath);
        if ((await content(dayAlbumPath))?.album.thumbnail?.path !== mediaPath) continue;
        if ((await content(yearAlbumPath))?.album.thumbnail?.path !== mediaPath) continue;
        await content('/');
    }

    const updates: KeyValueUpdates = { puts: new Map(), deletes: new Set() };
    for (const [albumPath, result] of computed) {
        if (result) {
            updates.puts.set(contentVersionKey(albumPath), result.version);
        } else {
            updates.deletes.add(contentVersionKey(albumPath));
            updates.deletes.add(navVersionKey(albumPath));
        }
    }
    for (const parentPath of navParents) {
        updates.puts.set(navVersionKey(parentPath), await getAlbumNavVersion(parentPath));
    }
    return updates;
}
