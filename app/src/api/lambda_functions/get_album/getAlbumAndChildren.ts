import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getAlbum } from './getAlbum';
import { getChildren } from './getChildren';
import { getPrevAndNextItem } from './getPrevAndNextItem';

/**
 * Retrieve an album and its children (images and subalbums) from DynamoDB.
 *
 * @param {*} docClient AWS DynamoDB DocumentClient
 * @param {*} tableName name of the Album table in DynamoDB
 * @param {*} path path of the album to get, like /2001/12-31/
 * @returns the albums or null if no such album
 */
export async function getAlbumAndChildren(
    docClient: DynamoDBDocumentClient,
    tableName: string,
    path: string,
): Promise<AlbumResponse | null> {
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
        response.album = await getAlbum(docClient, tableName, path);
        if (!response.album) return null; // TODO: throw exception?
        const prevAndNext = await getPrevAndNextItem(docClient, tableName, path);
        response.nextAlbum = prevAndNext.next;
        response.prevAlbum = prevAndNext.prev;
    }
    response.children = await getChildren(docClient, tableName, path);

    return response;
}

type AlbumResponse = {
    album?;
    nextAlbum?: string;
    prevAlbum?: string;
    children?;
};
