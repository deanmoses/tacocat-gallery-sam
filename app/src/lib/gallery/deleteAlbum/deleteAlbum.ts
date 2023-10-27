import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { getDynamoDbTableName } from '../../lambda_utils/Env';

/**
 * Delete an album and its photos and child albums.
 *
 * @param albumPath Path of the album to retrieve, like /2001/12-31/
 */
export async function deleteAlbum(albumPath: string) {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Cannot delete root album');
    }

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    // TODO: block delete if the album contains child photos or child albums
    const tableName = getDynamoDbTableName();
    const pathParts = getParentAndNameFromPath(albumPath);
    const ddbCommand = new DeleteCommand({
        TableName: tableName,
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
    });
    await docClient.send(ddbCommand);
}
