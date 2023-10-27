import { getLatestItemInAlbum } from './getLatestItemInAlbum';
import { AlbumThumbnailResponse } from '../galleryTypes';

/**
 * Retrieve the latest album in the gallery from DynamoDB.  Just retrieves
 * enough information to display a thumbnail: does not retrieve any child
 * photos or child albums.
 */
export async function getLatestAlbum(): Promise<AlbumThumbnailResponse | undefined> {
    // get path to current year's album
    const currentYearAlbumPath = `/${new Date().getUTCFullYear()}/`;
    const album = await getLatestItemInAlbum(currentYearAlbumPath);
    if (!album) return;
    else {
        return {
            album,
        };
    }
}
