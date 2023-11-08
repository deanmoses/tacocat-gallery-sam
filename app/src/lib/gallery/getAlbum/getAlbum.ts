import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { Album, AlbumResponse, GalleryItem, NavInfo, Navigable } from '../galleryTypes';
import { getChildItems, getItem } from '../../dynamo_utils/ddbGet';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { getParentFromPath } from '../../gallery_path_utils/getParentFromPath';

/**
 * Retrieve an album and its children (images and subalbums) from DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
export async function getAlbumAndChildren(albumPath: string): Promise<AlbumResponse | undefined> {
    if (!isValidAlbumPath(albumPath)) throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    const response: AlbumResponse = {};
    response.album = await getAlbum(albumPath);
    if (!response.album) return undefined;
    response.children = await getChildren(albumPath);
    // root is peerless
    if (albumPath !== '/') {
        const peers = await getPeers(albumPath);
        if (!!peers) {
            const nav = getPrevAndNext(albumPath, peers);
            response.nextAlbum = nav.next;
            response.prevAlbum = nav.prev;
        }
    }
    return response;
}

/**
 * Retrieve an album from DynamoDB.  Does not retrieve any child photos or child albums.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
export async function getAlbum(albumPath: string): Promise<Album | undefined> {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }
    if (albumPath === '/') {
        // Root album isn't in DynamoDB
        return {
            itemName: '/',
            parentPath: '',
            title: 'Dean, Lucie, Felix and Milo Moses',
        };
    } else {
        return await getItem(albumPath, [
            'itemName',
            'parentPath',
            'published',
            'updatedOn',
            'title',
            'description',
            'thumbnail',
        ]);
    }
}

/**
 * Get an album's immediate children: both images and subalbums.
 * Does not get grandchildren.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function getChildren(albumPath: string): Promise<Array<GalleryItem> | undefined> {
    return getChildItems(albumPath, [
        'itemName',
        'parentPath',
        'published',
        'itemType',
        'updatedOn',
        'dimensions',
        'title',
        'description',
        'tags',
        'thumbnail',
    ]);
}

/**
 * Get the peers of this album, so as to do prev/next
 */
async function getPeers(albumPath: string): Promise<Array<GalleryItem> | undefined> {
    const parentAlbumPath = getParentFromPath(albumPath);
    return getChildItems(parentAlbumPath, ['itemName', 'parentPath', 'published', 'title']);
}

/**
 * Given an album or image, retrieve both the previous and next album or image from DynamoDB.
 *
 * Just retrieves enough information to display a thumbnail: does not retrieve any
 * child photos or child albums.
 *
 * @param path Path of the item, like /2001/12-31/ or /2001/12-31/felix.jpg
 * @param peers The item and its peers
 */
function getPrevAndNext(path: string, peers: GalleryItem[]): Navigable {
    const pathParts = getParentAndNameFromPath(path);
    const nav: Navigable = {};
    if (!!peers) {
        let foundCurrent = false;
        peers.some((peer) => {
            // if we're still searching for the current item
            if (!foundCurrent) {
                if (peer.itemName === pathParts.name) {
                    foundCurrent = true;
                } else if (peer.published) {
                    nav.prev = itemNav(peer);
                }
            }
            // else we're past the current item and searching for the next published album
            else {
                if (peer.published) {
                    nav.next = itemNav(peer);
                    return true; // functions as a break, stops the execution of some()
                }
            }
        });
    }
    return nav;
}

function itemNav(item: GalleryItem): NavInfo {
    return {
        path: (item?.parentPath || '') + (item?.itemName || '') + '/',
        title: item.title,
    };
}
