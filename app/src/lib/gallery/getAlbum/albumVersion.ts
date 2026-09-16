import { putKeyIfAbsent } from '../../cloudfront_utils/keyValueStore';
import { shortHash, stableStringify } from '../../hash_utils/hash';
import { getOptionalAlbumVersionStoreArn } from '../../lambda_utils/Env';
import { Album } from '../galleryTypes';
import { getAlbumAndChildren, ItemOverlay } from './getAlbum';

/**
 * Album versions are what the API edge cache keys album responses on. They
 * live in a CloudFront KeyValueStore, one key per album, `content:<albumPath>`,
 * holding a hash of the album's response body. An edit moves the version of
 * the album and of its parent (whose child list carries the edited fields) and
 * leaves every other album's cache entry hitting.
 *
 * An album gets its first version from the API itself, on the first request
 * the edge finds no version for: the hash the response already carries as its
 * ETag, prefixed so it can never equal a version the stream Lambda computes.
 * Any hash of the content will do as a first version; what matters is that
 * every later change moves it, and without the prefix one could fail to: a
 * guest's view of an album is byte-identical to the admin's view once the
 * unpublished children are gone, so an ETag recorded from a guest could be
 * the very hash the stream Lambda computes after the admin deletes them.
 *
 * The stream Lambda's hash is over the admin's view of the album, unpublished
 * children and all, so it changes on every edit a guest could see, and on
 * some they cannot; the price of the latter is one extra cache miss.
 */

export function contentVersionKey(albumPath: string): string {
    return `content:${albumPath}`;
}

/**
 * Compute the album's content version, along with the album it was computed
 * from. Undefined if the album does not exist.
 *
 * @param overlay the rows the caller knows to be newer than a read may return:
 *   this runs off the stream within milliseconds of a write, and a read that
 *   has not caught up would hash the state before it, leaving the version
 *   where it was and the old response cached for a day
 */
export async function getAlbumContentVersion(
    albumPath: string,
    overlay?: ItemOverlay,
): Promise<{ version: string; album: Album } | undefined> {
    const album = await getAlbumAndChildren(albumPath, true /* include unpublished */, overlay);
    if (!album) return;
    return { version: shortHash(stableStringify(album)), album };
}

/**
 * Give an album the edge found no version for its first one. Best effort: a
 * failure is logged and the response goes out regardless, and a version that
 * arrived meanwhile from the stream Lambda is left alone.
 *
 * @param etag the response's ETag header, quotes and all
 */
export async function recordFirstAlbumVersion(albumPath: string, etag: string): Promise<void> {
    const kvsArn = getOptionalAlbumVersionStoreArn();
    if (!kvsArn) return;
    const version = 'first-' + etag.replace(/^W\//, '').replace(/"/g, '');
    try {
        if (await putKeyIfAbsent(contentVersionKey(albumPath), version, kvsArn)) {
            console.info({ event: 'album_version_recorded', albumPath, version });
        }
    } catch (e) {
        console.warn({
            event: 'album_version_record_failed',
            albumPath,
            error: e instanceof Error ? e.message : String(e),
        });
    }
}
