import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import {
    getParentAndNameFromPath,
    getParentFromPath,
    isValidAlbumPath,
    isValidDayAlbumPath,
    toImagePath,
    toPathFromItem,
} from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { Album, AlbumItem, GalleryItem, NavInfo, Navigable, Rectangle } from '../galleryTypes';
import { getChildItems, getItem } from '../../dynamo_utils/ddbGet';
import { getDynamoDbTableName } from '../../lambda_utils/Env';

/**
 * Retrieve an album and its children (images or subalbums) from DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
export async function getAlbumAndChildren(
    albumPath: string,
    includeUnpublishedAlbums: boolean = false,
): Promise<Album | undefined> {
    if (!isValidAlbumPath(albumPath)) throw new BadRequestException(`Malformed album path: [${albumPath}]`);

    const [album, children, peers] = await Promise.all([
        getAlbum(albumPath, includeUnpublishedAlbums),
        getChildren(albumPath, includeUnpublishedAlbums),
        getPeers(albumPath, includeUnpublishedAlbums),
    ]);

    if (!album) return;
    album.children = children;
    if (!!peers) {
        const nav = getPrevAndNext(albumPath, peers, includeUnpublishedAlbums);
        album.next = nav.next;
        album.prev = nav.prev;
    }

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
        const album = await getItem<AlbumItem>(albumPath, [
            'parentPath',
            'itemName',
            'itemType',
            'updatedOn',
            'description',
            'summary',
            'thumbnail',
            'published',
        ]);
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
): Promise<Array<GalleryItem> | undefined> {
    let children = await getChildItems(albumPath, [
        'parentPath',
        'itemName',
        'itemType',
        'updatedOn',
        'description',
        'thumbnail',
        'summary', // for albums
        'published', // for albums
        'versionId', // for images
        'title', // for images
        'tags', // for images
        'dimensions', // for images
    ]);
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
            await addCropInfoToChildAlbums(children as AlbumItem[]);
        }
    }
    return children;
}

/**
 * Get the peers of this album, so as to do prev/next
 */
async function getPeers(albumPath: string, includeUnpublishedAlbums: boolean): Promise<Array<GalleryItem> | undefined> {
    if (albumPath === '/') return; // root album is peerless
    const parentAlbumPath = getParentFromPath(albumPath);
    let peers = await getChildItems(parentAlbumPath, ['parentPath', 'itemName', 'itemType', 'published', 'title']);
    // If we're only including published albums, and the album contains child albums (meaning it's a root or year album, not a day album)
    if (peers && !includeUnpublishedAlbums && !isValidDayAlbumPath(albumPath)) {
        peers = (peers as AlbumItem[])?.filter((peer) => peer.published);
    }
    return peers;
}

/**
 * Given an album or image, retrieve both the previous and next album or image from DynamoDB.
 *
 * Retrieves just enough information to navigate to the prev/next: doesn't retrieve any
 * child photos or child albums.
 *
 * @param path Path of the item, like /2001/12-31/ or /2001/12-31/felix.jpg
 * @param peers The item and its peers
 */
function getPrevAndNext(path: string, peers: GalleryItem[], includeUnpublishedAlbums: boolean): Navigable {
    const pathParts = getParentAndNameFromPath(path);
    const nav: Navigable = {};
    if (!!peers) {
        let foundCurrent = false;
        peers.some((peer) => {
            // if we're still searching for the current item
            if (!foundCurrent) {
                if (peer.itemName === pathParts.name) {
                    foundCurrent = true;
                } else if (
                    peer.itemType === 'image' ||
                    includeUnpublishedAlbums ||
                    ('published' in peer && peer.published)
                ) {
                    nav.prev = itemNav(peer);
                }
            }
            // else we're past the current item and searching for the next published album
            else {
                if (peer.itemType === 'image' || includeUnpublishedAlbums || ('published' in peer && peer.published)) {
                    nav.next = itemNav(peer);
                    return true; // functions as a break, stops the execution of some()
                }
            }
        });
    }
    return nav;
}

function itemNav(item: GalleryItem): NavInfo {
    const nav: NavInfo = {
        path: toPathFromItem(item),
    };
    if ('title' in item) {
        nav.title = item.title;
    }
    return nav;
}

/**
 * Augment each child album's thumbnail entry with info from the image record in DynamoDB
 *
 * @param children child albums of an album
 */
async function addCropInfoToChildAlbums(children: AlbumItem[]): Promise<void> {
    const Keys: { parentPath: string; itemName: string }[] = [];
    if (!children || children.length === 0) return;
    children.forEach((album) => {
        if (album.thumbnail?.path) {
            const pathParts = getParentAndNameFromPath(album.thumbnail?.path);
            if (pathParts.name) {
                Keys.push({
                    parentPath: pathParts.parent,
                    itemName: pathParts.name,
                });
            }
        }
    });
    if (Keys.length === 0) return;
    const ddbCommand = new BatchGetCommand({
        RequestItems: {
            [getDynamoDbTableName()]: {
                Keys,
                ProjectionExpression: 'parentPath, itemName, thumbnail, versionId',
            },
        },
    });
    const ddbClient = new DynamoDBClient();
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const result = await docClient.send(ddbCommand);
    const imgInfos = new Map<
        string,
        { parentPath?: string; itemName?: string; thumbnail?: Rectangle; versionId?: string }
    >();
    result.Responses?.[getDynamoDbTableName()]?.forEach((item) => {
        const imagePath = toImagePath(item.parentPath, item.itemName);
        imgInfos.set(imagePath, item);
    });
    children.forEach((album) => {
        if (album.thumbnail?.path) {
            const imgInfo = imgInfos.get(album.thumbnail.path);
            if (!imgInfo)
                throw new Error(
                    `Album [${album.path}]: failed to get thumbnail info for image [${album.thumbnail.path}]`,
                );
            if (!imgInfo.versionId) throw new Error(`Missing versionId for image [${album.thumbnail.path}]`);
            album.thumbnail.versionId = imgInfo.versionId;
            if (imgInfo.thumbnail) {
                album.thumbnail.crop = imgInfo.thumbnail;
            }
        }
    });
}
