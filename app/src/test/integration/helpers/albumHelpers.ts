import { deleteAlbum } from '../../../lib/gallery/deleteAlbum/deleteAlbum';
import { deleteImage } from '../../../lib/gallery/deleteImage/deleteImage';
import { Album, ImageItem } from '../../../lib/gallery/galleryTypes';
import { getAlbumAndChildren } from '../../../lib/gallery/getAlbum/getAlbum';
import { itemExists } from '../../../lib/gallery/itemExists/itemExists';
import { findImage } from '../../../lib/gallery_client/AlbumObject';
import { getParentFromPath, isValidAlbumPath } from '../../../lib/gallery_path_utils/galleryPathUtils';
import { deleteOriginalsAndDerivatives } from '../../../lib/s3_utils/s3delete';

/**
 * Delete album, its images AND its parent album from S3 and DynamoDB.
 * For cleaning up after tests.
 *
 * @param albumPath path of album, like /2001/12-31/
 */
export async function cleanUpAlbumAndParents(albumPath: string): Promise<void> {
    await cleanUpAlbum(albumPath);
    const parentAlbumPath = getParentFromPath(albumPath);
    await cleanUpAlbum(parentAlbumPath);
}

/**
 * Delete album and its images from S3 and DynamoDB.
 * Does not delete parent album.
 * For cleaning up after tests.
 *
 * @param albumPath path of album, like /2001/12-31/
 */
export async function cleanUpAlbum(albumPath: string): Promise<void> {
    try {
        const children = (await getAlbumAndChildren(albumPath))?.children;
        if (!!children) {
            for (const child of children) {
                try {
                    if (!child.parentPath) throw 'child has no parent path';
                    const childPath = child.parentPath + child.itemName;
                    if (isValidAlbumPath(childPath)) {
                        console.error(
                            `Album Cleanup: album [${albumPath}] contains child album [${child?.itemName}].  Delete child albums before parent albums.  Continuing.`,
                        );
                    } else {
                        await deleteImage(childPath);
                    }
                } catch (e) {
                    console.error(
                        `Album Cleanup: error deleting [${child?.itemName}] from album [${albumPath}].  Continuing.`,
                        e,
                    );
                }
            }
        }
    } catch (e) {
        console.error(`Album Cleanup: error deleting children of album [${albumPath}].  Continuing.`, e);
    }

    try {
        await deleteAlbum(albumPath);
    } catch (e) {
        console.error(`Album Cleanup: error deleting album [${albumPath}].  Continuing.`, e);
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
 * @param albumPath album path like /2001/12-31/
 * @param imageName image name like image.jpg
 */
export async function getImageOrThrow(albumPath: string, imageName: string): Promise<ImageItem> {
    const album = await getAlbumAndChildrenOrThrow(albumPath);
    return findImageOrThrow(album, imageName);
}

/**
 * Find named image in specified album, throw if it doesn't exist
 *
 * @param album album object
 * @param imageName image name like image.jpg
 */
export function findImageOrThrow(album: Album, imageName: string): ImageItem {
    const image = findImage(album, imageName);
    if (!image) throw new Error(`Album [${album.path}] has no child image [${imageName}]`);
    return image;
}

/**
 * Retrieve album, throw if it doesn't exist
 *
 * @param albumPath album path like /2001/12-31/
 */
export async function getAlbumAndChildrenOrThrow(albumPath: string): Promise<Album> {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error(`No album [${albumPath}]`);
    return album;
}
