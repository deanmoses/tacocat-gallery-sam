import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { Album } from '../galleryTypes';
import { getItem } from '../../dynamo_utils/ddbGet';

/**
 * Retrieve an album from DynamoDB.  Does not retrieve any child photos or child albums.
 *
 * @param albumPath Path of the album to retrieve, like /2001/12-31/
 */
export async function getAlbum(albumPath: string): Promise<Album | undefined> {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }
    return getItem(albumPath, [
        'itemName',
        'parentPath',
        'published',
        'itemType',
        'updatedOn',
        'title',
        'description',
        'thumbnail',
    ]);
}
