import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { isValidAlbumPath, isValidImagePath } from '../../gallery_path_utils/pathValidator';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';

/**
 * Return true if the specified album or image exists in DynamoDB.
 *
 * @param path path of the album or image, like /2001/12-31/ or /2001/12-31/image.jpg
 */
export async function itemExists(path: string) {
    if (!isValidAlbumPath(path) && !isValidImagePath(path)) {
        throw new BadRequestException(`Malformed path: [${path}]`);
    }

    if (path === '/') {
        throw new BadRequestException('Malformed path: root album does not exist in database');
    }

    const pathParts = getParentAndNameFromPath(path);
    const ddbCommand = new GetCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
    });

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        const response = await docClient.send(ddbCommand);
        const itemExists = !!response?.Item;
        return itemExists;
    } catch (e) {
        console.error(`Error attempting to retrieve item [${path}]: `, e);
        throw e;
    }
}
