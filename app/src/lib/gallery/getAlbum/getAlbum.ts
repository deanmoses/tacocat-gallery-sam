import {
    getParentAndNameFromPath,
    isValidAlbumPath,
    isValidDayAlbumPath,
    toPathFromItem,
} from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { Album, AlbumItem, GalleryItem, GalleryItemKey } from '../galleryTypes';
import { getChildItems, getItem } from '../../dynamo_utils/ddbGet';
import { augmentAlbumThumbnailsWithImageInfo } from '../../dynamo_utils/albumThumbnailHelper';

/**
 * Rows the caller knows to be newer than the table may return, by path, laid
 * over what it reads. A DynamoDB stream consumer holds exactly the rows a
 * replica could be behind on, the batch's own images, so with these applied
 * an eventually consistent read is as good as a consistent one at half the
 * cost. Removed rows are dropped wherever they would have appeared.
 */
export type ItemOverlay = { items: Map<string, GalleryItem>; removed: Set<string> };

const ALBUM_ATTRIBUTES: (keyof AlbumItem)[] = [
    'parentPath',
    'itemName',
    'itemType',
    'updatedOn',
    'description',
    'summary',
    'thumbnail',
    'published',
];

const CHILD_ATTRIBUTES: GalleryItemKey[] = [
    'parentPath',
    'itemName',
    'itemType',
    'updatedOn',
    'description',
    'thumbnail',
    'summary', // for albums
    'published', // for albums
    'versionId', // for images/videos
    'title', // for images/videos
    'tags', // for images/videos
    'dimensions', // for images/videos
    'mediaType', // for videos
    'duration', // for videos
];

/**
 * Retrieve an album and its children (images or subalbums) from DynamoDB.
 *
 * The response depends on nothing outside the album's own subtree, which is
 * what lets the edge cache key it on a hash of its own content. Anything
 * drawn from the siblings, prev/next links say, would tie every album's
 * cache entry to every edit of its neighbours.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
export async function getAlbumAndChildren(
    albumPath: string,
    includeUnpublishedAlbums: boolean = false,
    overlay?: ItemOverlay,
): Promise<Album | undefined> {
    if (!isValidAlbumPath(albumPath)) throw new BadRequestException(`Malformed album path: [${albumPath}]`);

    const [album, children] = await Promise.all([
        getAlbum(albumPath, includeUnpublishedAlbums, overlay),
        getChildren(albumPath, includeUnpublishedAlbums, overlay),
    ]);

    if (!album) return;
    album.children = children;
    return album;
}

/**
 * Retrieve an album from DynamoDB.  Does not retrieve any child photos or child albums.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
export async function getAlbum(
    albumPath: string,
    includeUnpublishedAlbums: boolean = false,
    overlay?: ItemOverlay,
): Promise<Album | undefined> {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }
    if (albumPath === '/') {
        // Root album isn't in DynamoDB
        return {
            path: '/',
            parentPath: '',
            itemName: '/',
            itemType: 'album',
        };
    } else {
        if (overlay?.removed.has(albumPath)) return;
        const fresh = overlay?.items.get(albumPath);
        const album = fresh
            ? pick(fresh as AlbumItem, ALBUM_ATTRIBUTES)
            : await getItem<AlbumItem>(albumPath, ALBUM_ATTRIBUTES);
        if (!album) return;
        if (!album.published && !includeUnpublishedAlbums) return;
        album.path = toPathFromItem(album);
        return album;
    }
}

/**
 * Get an album's immediate children: both images and subalbums.
 * Does not get grandchildren.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function getChildren(
    albumPath: string,
    includeUnpublishedAlbums: boolean,
    overlay?: ItemOverlay,
): Promise<Array<GalleryItem> | undefined> {
    let children = await getChildItems(albumPath, CHILD_ATTRIBUTES);
    if (overlay) children = overlaid(children ?? [], albumPath, overlay);
    if (!!children) {
        // Add path to each child
        children = children.map((child) => {
            child.path = toPathFromItem(child);
            return child;
        });
        // If the children are albums not images (meaning it's a root or year album, not a day album)
        if (!isValidDayAlbumPath(albumPath)) {
            if (!includeUnpublishedAlbums) {
                // Filter out unpublished albums
                children = (children as AlbumItem[]).filter((child) => child.published);
            }
            // Augment album thumbnail entries with info from the image record in DynamoDB
            await augmentAlbumThumbnailsWithImageInfo(children, overlay);
        }
    }
    return children;
}

/**
 * The album's children with the overlay's rows in place of the table's, in
 * the table's order, and undefined when there are none, as a query would say.
 */
function overlaid(children: GalleryItem[], albumPath: string, overlay: ItemOverlay): GalleryItem[] | undefined {
    const byName = new Map(children.map((child) => [child.itemName, child]));
    for (const [path, item] of overlay.items) {
        if (getParentAndNameFromPath(path).parent === albumPath)
            byName.set(item.itemName, pick(item, CHILD_ATTRIBUTES));
    }
    for (const path of overlay.removed) {
        const { parent, name } = getParentAndNameFromPath(path);
        if (parent === albumPath) byName.delete(name);
    }
    if (byName.size === 0) return;
    // The query's order: by sort key, which for these names is code point order
    const name = (item: GalleryItem) => item.itemName ?? '';
    return [...byName.values()].sort((a, b) => (name(a) < name(b) ? -1 : name(a) > name(b) ? 1 : 0));
}

/** The attributes a read would have projected, so an overlaid row hashes like a read one */
function pick<T extends GalleryItem>(item: T, attributes: readonly PropertyKey[]): T {
    const source = item as Record<PropertyKey, unknown>;
    const picked: Record<PropertyKey, unknown> = {};
    for (const attribute of attributes) {
        if (attribute in source) picked[attribute] = source[attribute];
    }
    return picked as T;
}
