import { DynamoDBClient, ExecuteStatementCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { getDynamoDbTableName } from '../../lambda_utils/Env';

/**
 * Delete an album and its photos and child albums.
 *
 * @param albumPath Path of the album to delete, like /2001/12-31/
 */
export async function deleteAlbum(albumPath: string) {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Malformed album path: cannot delete root album');
    }

    if (await albumContainsChildAlbums(albumPath)) {
        throw new BadRequestException(`Album [${albumPath}] contains child albums, and thus cannot be deleted.`);
    }

    // TODO: delete child images

    deleteAlbumFromDynamoDB(albumPath);
}

/**
 * Return whether or not the specified album contains sub-albums
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function albumContainsChildAlbums(albumPath: string): Promise<boolean> {
    const ddbCommand = new ExecuteStatementCommand({
        Statement:
            'SELECT itemName' +
            ` FROM "${getDynamoDbTableName()}"` +
            ` WHERE parentPath='${albumPath}' AND itemType='album'`,
    });
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const results = await docClient.send(ddbCommand);
    return !!results?.Items?.length;
}

/**
 * Delete the album from DynamoDB.  Does NOT delete any child albums.
 * TODO: add some sort of expression to prevent the delete from happening if there are child albums
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function deleteAlbumFromDynamoDB(albumPath: string) {
    const pathParts = getParentAndNameFromPath(albumPath);
    const ddbCommand = new DeleteCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
    });

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    await docClient.send(ddbCommand);
}
