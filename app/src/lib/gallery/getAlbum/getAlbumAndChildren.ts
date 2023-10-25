import { BadRequestException } from '../../api_gateway_utils/BadRequestException';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { AlbumResponse } from '../galleryTypes';
import { getAlbum } from './getAlbum';
import { getChildren } from './getChildren';
import { getPrevAndNextItem } from './getPrevAndNextItem';

/**
 * Retrieve an album and its children (images and subalbums) from DynamoDB.
 *
 * @param tableName name of the Album table in DynamoDB
 * @param path path of the album to get, like /2001/12-31/
 */
export async function getAlbumAndChildren(tableName: string, path: string): Promise<AlbumResponse | null> {
    if (!tableName) throw 'No gallery item table defined';

    if (!path) {
        throw new BadRequestException('Must specify album');
    }

    if (!isValidAlbumPath(path)) {
        throw new BadRequestException(`Malformed album path: [${path}]`);
    }

    // ensure albumId starts with a "/"
    if (path.lastIndexOf('/', 0) !== 0) path = '/' + path;

    const response: AlbumResponse = {};

    if (path === '/') {
        // Root album isn't in DynamoDB
        response.album = {
            itemName: '/',
            parentPath: '',
            title: 'Dean, Lucie, Felix and Milo Moses',
        };
    } else {
        response.album = await getAlbum(tableName, path);
        if (!response.album) return null; // TODO: throw exception?
        const prevAndNext = await getPrevAndNextItem(tableName, path);
        response.nextAlbum = prevAndNext.next;
        response.prevAlbum = prevAndNext.prev;
    }
    response.children = await getChildren(tableName, path);

    return response;
}
