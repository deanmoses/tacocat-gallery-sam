import { DynamoDBClient, ExecuteStatementCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath, isValidAlbumPath } from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';

/**
 * Delete an empty album.  Cannot contain children.
 *
 * @param albumPath Path of the album to delete, like /2001/12-31/
 */
export async function deleteAlbum(albumPath: string) {
    console.info(`Delete Album: deleting [${albumPath}]...`);
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Malformed album path: cannot delete root album');
    }

    if (await albumContainsChildren(albumPath)) {
        throw new BadRequestException(
            `Album [${albumPath}] contains child photos or child albums, and thus cannot be deleted.`,
        );
    }

    await deleteAlbumFromDynamoDB(albumPath);
    console.info(`Delete Album: deleted [${albumPath}]`);
}

/**
 * Return whether or not the specified album contains photos or child albums
 *
 * @param albumPath Path of album, like /2001/12-31/
 */
async function albumContainsChildren(albumPath: string): Promise<boolean> {
    const ddbCommand = new ExecuteStatementCommand({
        Statement: `SELECT itemName FROM "${getDynamoDbTableName()}" WHERE parentPath='${albumPath}'`,
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
