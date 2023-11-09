import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath, isValidAlbumPath, isValidPath } from '../gallery_path_utils/galleryPathUtils';
import { getDynamoDbTableName } from '../lambda_utils/Env';
import { GalleryItem } from '../gallery/galleryTypes';

/**
 * Get the full contents of an album or image from DynamoDB
 * Does not retrieve any children.
 *
 * @param path path to album or image, like /2001/12-31/ or /2001/12-31/image.jpg
 */
export async function getFullItemFromDynamoDB(path: string): Promise<GalleryItem | undefined> {
    if (!isValidPath(path)) throw new Error(`Invalid path [${path}]`);
    return getItem(path);
}

/**
 * Retrieve the specified attributes of the specified item from DynamoDB.
 * Does not retrieve any children.
 *
 * @param path Path of album or image to retrieve, like /2001/12-31/ or /2001/12-31/image.jpg
 * @param attributes Name of the attributes to include.  If blank, returns ALL attributes.
 */
export async function getItem(path: string, attributes: string[] = []): Promise<GalleryItem | undefined> {
    if (!isValidPath(path)) throw new Error(`Invalid path: [${path}]`);
    const pathParts = getParentAndNameFromPath(path);
    if (!pathParts.name) throw new Error(`Root [${path}] is not stored in database`);
    const ddbCommand = new GetCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
    });
    if (attributes?.length && attributes?.length > 0) {
        ddbCommand.input.ProjectionExpression = attributes.toString();
    }
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const result = await docClient.send(ddbCommand);
    return result.Item;
}

/**
 * Get the full contents of all the children of the specified album from DynamoDB.
 *
 * @param albumPath path to album, like /2001/12-31/
 */
export async function getFullChildrenFromDynamoDB(albumPath: string): Promise<GalleryItem[] | undefined> {
    return getChildItems(albumPath);
}

/**
 * Get the specified attributes of all the children of the specified album from DynamoDB.
 *
 * @param albumPath path to album, like /2001/12-31/
 * @param attributes Name of the attributes to include.  If blank, returns ALL attributes.
 */
export async function getChildItems(albumPath: string, attributes: string[] = []): Promise<GalleryItem[] | undefined> {
    if (!isValidAlbumPath(albumPath)) throw new Error(`Invalid album path [${albumPath}]`);
    const ddbCommand = new QueryCommand({
        TableName: getDynamoDbTableName(),
        KeyConditionExpression: 'parentPath = :parentPath',
        ExpressionAttributeValues: {
            ':parentPath': albumPath,
        },
    });
    if (attributes?.length && attributes?.length > 0) {
        ddbCommand.input.ProjectionExpression = attributes.toString();
    }
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const results = await docClient.send(ddbCommand);
    return results.Items;
}
