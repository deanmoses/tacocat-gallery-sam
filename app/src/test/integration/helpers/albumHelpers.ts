import { deleteAlbum } from '../../../lib/gallery/deleteAlbum/deleteAlbum';
import { deleteImage } from '../../../lib/gallery/deleteImage/deleteImage';
import { getAlbumAndChildren } from '../../../lib/gallery/getAlbum/getAlbumAndChildren';
import { itemExists } from '../../../lib/gallery/itemExists/itemExists';

/**
 * Delete album and its children from S3 and DynamoDB.
 * For cleaning up after tests.
 * @param albumPath
 */
export async function cleanUpAlbum(albumPath: string): Promise<void> {
    const children = (await getAlbumAndChildren(albumPath))?.children;
    if (!!children) {
        for (const child of children) {
            if (!child.parentPath) throw 'child has no parent path';
            const childPath = child.parentPath + child.itemName;
            await deleteImage(childPath);
        }
    }

    await deleteAlbum(albumPath);
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
