import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { BadRequestException } from '../../lambda_utils/BadRequestException';

/**
 * Retrieve an album from DynamoDB.  Does not retrieve any child photos or child albums.
 *
 * @param tableName Name of the table in DynamoDB containing gallery items
 * @param albumPath Path of the album to retrieve, like /2001/12-31/
 */
export async function getAlbum(tableName: string, albumPath: string) {
    //
    // Validate the input
    //
    if (!tableName) throw 'No gallery item table defined';

    if (!albumPath) {
        throw new BadRequestException('Must specify album');
    }

    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    const pathParts = getParentAndNameFromPath(albumPath);
    const ddbCommand = new GetCommand({
        TableName: tableName,
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
        ProjectionExpression: 'itemName,parentPath,published,itemType,updatedOn,title,description,thumbnail',
    });
    const result = await docClient.send(ddbCommand);
    return result.Item;
}
