import { getLatestItemInAlbum } from './getLatestItemInAlbum';
import { AlbumThumbnailResponse } from '../galleryTypes';

/**
 * Retrieve the latest album in the gallery from DynamoDB.  Just retrieves
 * enough information to display a thumbnail: does not retrieve any child
 * photos or child albums.
 *
 * @param tableName Name of the table in DynamoDB containing gallery items
 */
export async function getLatestAlbum(tableName: string): Promise<AlbumThumbnailResponse | undefined> {
    if (!tableName) throw 'No gallery table name defined';

    // get current year's album
    const currentYearAlbumPath = `/${new Date().getUTCFullYear()}/`;
    const album = await getLatestItemInAlbum(tableName, currentYearAlbumPath);
    if (!album) return;
    else {
        // get the latest album of the current year
        return {
            album: await getLatestItemInAlbum(tableName, currentYearAlbumPath),
        };
    }
}
