import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { AlbumResponse, GalleryItem } from '../galleryTypes';
import { getAlbum } from './getAlbum';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { getChildItems } from '../../dynamo_utils/ddbGet';

/**
 * Retrieve an album and its children (images and subalbums) from DynamoDB.
 *
 * @param path path of the album to get, like /2001/12-31/
 */
export async function getAlbumAndChildren(path: string): Promise<AlbumResponse | undefined> {
    if (!isValidAlbumPath(path)) throw new BadRequestException(`Malformed album path: [${path}]`);
    const response: AlbumResponse = {};
    if (path === '/') {
        // Root album isn't in DynamoDB
        response.album = {
            itemName: '/',
            parentPath: '',
            title: 'Dean, Lucie, Felix and Milo Moses',
        };
    } else {
        response.album = await getAlbum(path);
        if (!response.album) return undefined;
    }
    response.children = await getChildren(path);
    if (!!response.children) {
        const prevAndNext = getPrevAndNextItem(path, response.children);
        response.nextAlbum = prevAndNext.next;
        response.prevAlbum = prevAndNext.prev;
    }
    return response;
}

/**
 * Get an album's immediate children: both images and subalbums.
 * Does not get grandchildren.
 *
 * @param albumPath Path of the album whose children are to be retrieved, like /2001/12-31/
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
 * Given an album or image, retrieve both the previous and next album or image from DynamoDB.
 *
 * Just retrieves enough information to display a thumbnail: does not retrieve any
 * child photos or child albums.
 *
 * @param path Path of the item, like /2001/12-31/ or /2001/12-31/felix.jpg
 * @param peers The item and its peers
 */
function getPrevAndNextItem(path: string, peers: GalleryItem[]): PrevAndNext {
    const pathParts = getParentAndNameFromPath(path);

    // find prev & next
    let prev;
    let next;
    if (!!peers) {
        let foundCurrent = false;
        peers.some((peer) => {
            // if we're still searching for the current item
            if (!foundCurrent) {
                if (peer.itemName === pathParts.name) {
                    foundCurrent = true;
                } else if (peer.published) {
                    prev = peer;
                }
            }
            // else we're past the current item and searching for the next published album
            else {
                if (peer.published) {
                    next = peer;
                    return true; // functions as a break, stops the execution of some()
                }
            }
        });
    }

    return {
        prev: prev,
        next: next,
    };
}

type PrevAndNext = {
    prev: string | undefined;
    next: string | undefined;
};
