import { deleteAlbum } from '../../../lib/gallery/deleteAlbum/deleteAlbum';
import { deleteImage } from '../../../lib/gallery/deleteImage/deleteImage';
import { Album, GalleryItem, ImageItem } from '../../../lib/gallery/galleryTypes';
import { getAlbumAndChildren } from '../../../lib/gallery/getAlbum/getAlbum';
import { itemExists } from '../../../lib/gallery/itemExists/itemExists';
import { findImage } from '../../../lib/gallery_client/AlbumObject';
import {
    getParentAndNameFromPath,
    getParentFromPath,
    isValidAlbumPath,
    isValidDayAlbumName,
} from '../../../lib/gallery_path_utils/galleryPathUtils';
import { deleteOriginalsAndDerivatives } from '../../../lib/s3_utils/s3delete';

/**
 * Delete album, its images AND its parent album from S3 and DynamoDB.
 * For cleaning up after tests.
 *
 * @param albumPath path of album, like /2001/12-31/
 */
export async function cleanUpAlbumAndParents(albumPath: string): Promise<void> {
    try {
        await cleanUpAlbum(albumPath);
    } catch (e) {
        console.error(`Album Cleanup: error deleting album [${albumPath}].  Continuing.`, e);
    }
    const parentAlbumPath = getParentFromPath(albumPath);
    try {
        await cleanUpAlbum(parentAlbumPath);
    } catch (e) {
        console.error(`Album Cleanup: error deleting parent album [${parentAlbumPath}].  Continuing.`, e);
    }
}

/**
 * Delete album and its images from S3 and DynamoDB.
 * Does not delete parent album.
 * For cleaning up after tests.
 *
 * @param albumPath path of album, like /2001/12-31/
 */
export async function cleanUpAlbum(albumPath: string): Promise<void> {
    console.log(`Album Cleanup: cleaning up album [${albumPath}]`);
    if (!isValidAlbumPath(albumPath)) {
        console.error(`Album Cleanup: album path [${albumPath}] is invalid`);
        return;
    }
    if (!(await itemExists(albumPath))) {
        console.warn(`Album Cleanup: album [${albumPath}] does not exist`);
    } else {
        try {
            await cleanUpChildren(albumPath);
        } catch (e) {
            console.error(`Album Cleanup: error deleting children of album [${albumPath}].  Continuing.`, e);
        }
        try {
            await deleteAlbum(albumPath);
        } catch (e) {
            console.error(`Album Cleanup: error deleting album [${albumPath}].  Continuing.`, e);
        }
    }
    try {
        // This will clean up images from DynamoDB that don't have an album entry.
        // This will happen when I have really broken services that copy the images in S3
        // but don't yet delete them nor create the DynamoDB entries for those images.
        // (like what happened with my first draft of Album Rename as of Nov 7 2023)
        await deleteOriginalsAndDerivatives(albumPath);
    } catch (e) {
        console.error(
            `Album Cleanup: error last-chance deleting all S3 images for album [${albumPath}].  Continuing.`,
            e,
        );
    }
    console.log(`Album Cleanup: cleaned up album [${albumPath}]`);
}

/** Clean up children of specified album */
async function cleanUpChildren(albumPath: string): Promise<void> {
    const album = await getAlbumAndChildren(albumPath, true /* include unpublished albums*/);
    if (!album) throw new Error(`Album [${albumPath}] does not exist`);
    if (!!album?.children?.length) {
        console.log(`Album Cleanup: cleaning up album [${albumPath}]'s [${album.children.length}] children...`);
        await Promise.allSettled(album.children.map((child) => cleanUpChildImage(albumPath, child)));
    } else {
        console.log(`Album Cleanup: album [${albumPath}] has no children, skipping child cleanup phase`);
    }
}

/** Clean up single child image */
async function cleanUpChildImage(albumPath: string, child: GalleryItem): Promise<void> {
    console.log(`Album Cleanup: cleaning up album [${albumPath}]'s child [${child?.itemName}]`);
    try {
        if (!child.itemName) throw 'child has no name';
        if (isValidDayAlbumName(child.itemName)) {
            console.error(
                `Album Cleanup: album [${albumPath}] contains child album [${child?.itemName}].  Delete child albums before parent albums.  Continuing.`,
            );
        } else {
            if (!child.parentPath) throw 'child has no parent path';
            const childPath = child.parentPath + child.itemName;
            console.log(`Album Cleanup: deleting album [${albumPath}]'s image [${childPath}]`);
            await deleteImage(childPath);
            console.log(`Album Cleanup: deleted album [${albumPath}]'s image [${childPath}]`);
        }
    } catch (e) {
        console.error(`Album Cleanup: error deleting [${child?.itemName}] from album [${albumPath}].  Continuing.`, e);
    }
}

/**
 * Throw error if the specified album or image does NOT exist in DynamoDB
 *
 * @param path path of the album or image, like /2001/12-31/ or /2001/12-31/image.jpg
 */
export async function assertDynamoDBItemExists(path: string): Promise<void> {
    if (!(await itemExists(path))) throw new Error(`[${path}] must exist in DynamoDB at start of suite`);
}

/**
 * Throw error if the specified album or image exists in DynamoDB
 *
 * @param path path of the album or image, like /2001/12-31/ or /2001/12-31/image.jpg
 */
export async function assertDynamoDBItemDoesNotExist(path: string): Promise<void> {
    if (await itemExists(path)) throw new Error(`[${path}] cannot exist in DynamoDB at start of suite`);
}

/**
 * Retrieve album, find image, throw if the things don't exist
 *
 * @param imagePath image path like /2001/12-31/image.jpg
 */
export async function getImageOrThrow(
    imagePath: string,
    includeUnpublishedAlbums: boolean = false,
): Promise<ImageItem> {
    const imagePathParts = getParentAndNameFromPath(imagePath);
    const albumPath = imagePathParts.parent;
    const imageName = imagePathParts.name;
    if (!imageName) throw new Error(`No image name found in path [${imagePath}]`);
    const album = await getAlbumAndChildrenOrThrow(albumPath, includeUnpublishedAlbums);
    return findImageOrThrow(album, imageName);
}

/**
 * Find named image in specified album, throw if it doesn't exist
 *
 * @param album album object
 * @param imageName image name like image.jpg
 */
export function findImageOrThrow(album: Album, imageName: string): ImageItem {
    if (!album.children || album.children.length === 0) throw new Error(`Album [${album.path}] has no children`);
    const image = findImage(album, imageName);
    if (!image) throw new Error(`Album [${album.path}] has no child image [${imageName}]`);
    return image;
}

/**
 * Retrieve album, throw if it doesn't exist
 *
 * @param albumPath album path like /2001/12-31/
 */
export async function getAlbumAndChildrenOrThrow(
    albumPath: string,
    includeUnpublishedAlbums: boolean = false,
): Promise<Album> {
    const album = await getAlbumAndChildren(albumPath, includeUnpublishedAlbums);
    if (!album) throw new Error(`No album [${albumPath}]`);
    return album;
}
