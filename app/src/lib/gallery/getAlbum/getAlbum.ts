import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import {
    getNameFromPath,
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
import { findImage } from '../../gallery_client/AlbumObject';
import { getDynamoDbTableName } from '../../lambda_utils/Env';

/**
 * Retrieve an album and its children (images or subalbums) from DynamoDB.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
export async function getAlbumAndChildren(albumPath: string): Promise<Album | undefined> {
    if (!isValidAlbumPath(albumPath)) throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    const album = await getAlbum(albumPath);
    if (!album) return undefined;
    album.children = await getChildren(albumPath);
    // add album's thumbnail's crop info to the album
    // TODO: this will only work for day albums
    // For year albums, we'll need to get thumbnail info
    // from the leaf images
    if (album.thumbnail?.path && album.children) {
        console.log(`Got children`);
        const imageName = getNameFromPath(album.thumbnail.path);
        if (imageName) {
            const thumbnailImage = findImage(album, imageName);
            if (thumbnailImage) {
                if (thumbnailImage.thumbnail) {
                    album.thumbnail.crop = thumbnailImage.thumbnail;
                } else {
                    console.warn(`Found no crop info on image [${thumbnailImage.path}]`);
                }
                // TODO: Image Processor should save either the processed date
                // or the file save date (maybe the uploaded to S3 date) or a
                // version #, that'll be used as a cachebuster here.
                // Save it to the fileUpdatedOn field of the image.
                if (thumbnailImage.updatedOn) {
                    album.thumbnail.fileUpdatedOn = thumbnailImage.updatedOn;
                }
            }
        }
    }

    // root album is peerless. otherwise, get prev/next album
    if (albumPath !== '/') {
        const peers = await getPeers(albumPath);
        if (!!peers) {
            const nav = getPrevAndNext(albumPath, peers);
            album.next = nav.next;
            album.prev = nav.prev;
        }
    }
    return album;
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
        if (!!album) album.path = toPathFromItem(album);
        return album;
    }
}

/**
 * Get an album's immediate children: both images and subalbums.
 * Does not get grandchildren.
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function getChildren(albumPath: string): Promise<Array<GalleryItem> | undefined> {
    let children = await getChildItems(albumPath, [
        'parentPath',
        'itemName',
        'itemType',
        'updatedOn',
        'title',
        'description',
        'summary',
        'thumbnail',
        'tags',
        'published',
        'dimensions',
    ]);
    if (!!children) {
        children = children.map((child) => {
            child.path = toPathFromItem(child);
            return child;
        });
        // If it's a root or year album
        if (!isValidDayAlbumPath(albumPath)) {
            await addCropInfoToChildAlbums(children as AlbumItem[]);
        }
    }
    return children;
}

/**
 * Get the peers of this album, so as to do prev/next
 */
async function getPeers(albumPath: string): Promise<Array<GalleryItem> | undefined> {
    const parentAlbumPath = getParentFromPath(albumPath);
    return await getChildItems(parentAlbumPath, ['parentPath', 'itemName', 'itemType', 'published', 'title']);
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
                } else if (peer.itemType === 'image' || ('published' in peer && peer.published)) {
                    nav.prev = itemNav(peer);
                }
            }
            // else we're past the current item and searching for the next published album
            else {
                if (peer.itemType === 'image' || ('published' in peer && peer.published)) {
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

async function addCropInfoToChildAlbums(children: AlbumItem[]): Promise<void> {
    const Keys: { parentPath: string; itemName: string }[] = [];
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
    const ddbCommand = new BatchGetCommand({
        RequestItems: {
            [getDynamoDbTableName()]: {
                Keys,
                ProjectionExpression: 'parentPath, itemName, thumbnail',
            },
        },
    });
    const ddbClient = new DynamoDBClient();
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const result = await docClient.send(ddbCommand);
    const cropInfos = new Map<string, Rectangle>();
    result.Responses?.[getDynamoDbTableName()]?.forEach((item) => {
        if (item.thumbnail) {
            const imagePath = toImagePath(item.parentPath, item.itemName);
            cropInfos.set(imagePath, item.thumbnail);
        }
    });
    children.forEach((album) => {
        if (album.thumbnail?.path) {
            const cropInfo = cropInfos.get(album.thumbnail.path);
            if (cropInfo) {
                album.thumbnail.crop = cropInfo;
            }
        }
    });
}
