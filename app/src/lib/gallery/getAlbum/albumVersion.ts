import { getChildItems } from '../../dynamo_utils/ddbGet';
import { shortHash, stableStringify } from '../../hash_utils/hash';
import { Album, GalleryItemKey } from '../galleryTypes';
import { getAlbumAndChildren } from './getAlbum';

/**
 * Album versions are what the API edge cache keys album responses on. They
 * live in a CloudFront KeyValueStore, under these keys:
 *
 *  - `content:<albumPath>`: hash of the album's response body, less prev/next.
 *  - `nav:<parentPath>`: hash of what prev/next is computed from, the parent's
 *    child list. Held once per parent so that publishing or removing an album
 *    changes one key rather than every sibling's.
 *
 * An album's cache key is content:<album> joined with nav:<parent>, so an edit
 * to one album invalidates that album and its parent (whose child list carries
 * the edited fields) and leaves every other album's cache entry hitting.
 *
 * The hash is over the admin's view of the album, unpublished children and all,
 * so it changes on every edit a guest could see, and on some they cannot; the
 * price of the latter is one extra cache miss.
 */

export function contentVersionKey(albumPath: string): string {
    return `content:${albumPath}`;
}

export function navVersionKey(parentPath: string): string {
    return `nav:${parentPath}`;
}

/**
 * Compute the album's content version, along with the album it was computed
 * from. Undefined if the album does not exist.
 */
export async function getAlbumContentVersion(
    albumPath: string,
): Promise<{ version: string; album: Album } | undefined> {
    const album = await getAlbumAndChildren(albumPath, true /* include unpublished */);
    if (!album) return;
    const content: Album = { ...album };
    delete content.prev;
    delete content.next;
    return { version: shortHash(stableStringify(content)), album };
}

/**
 * Compute the nav version of a parent album: a hash of what its children's
 * prev/next links are computed from. Same projection as getAlbum's peer query.
 */
export async function getAlbumNavVersion(parentPath: string): Promise<string> {
    const peers = await getChildItems(parentPath, NAV_FIELDS);
    const navFields = (peers ?? []).map((peer) => {
        const fields = peer as Partial<Record<(typeof NAV_FIELDS)[number], unknown>>;
        return Object.fromEntries(NAV_FIELDS.map((f) => [f, fields[f]]));
    });
    return shortHash(stableStringify(navFields));
}

/** What getAlbum's peer query projects: everything prev/next is computed from */
const NAV_FIELDS = ['parentPath', 'itemName', 'itemType', 'published', 'title'] as const satisfies GalleryItemKey[];
