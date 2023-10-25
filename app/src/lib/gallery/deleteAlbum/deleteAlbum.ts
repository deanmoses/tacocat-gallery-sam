import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { BadRequestException } from '../../api_gateway_utils/BadRequestException';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';

/**
 * Delete an album and its photos and child albums.
 *
 * @param tableName Name of the table in DynamoDB containing gallery items
 * @param albumPath Path of the album to retrieve, like /2001/12-31/
 */
export async function deleteAlbum(tableName: string, albumPath: string) {
    if (!tableName) throw 'No DynamoDB table defined';

    if (!albumPath) {
        throw new BadRequestException('No album specified');
    }

    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Cannot delete root album');
    }

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    // TODO: delete photos and child albums
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
