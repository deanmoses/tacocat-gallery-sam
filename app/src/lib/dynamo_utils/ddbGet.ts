import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath, isValidAlbumPath, isValidPath } from '../gallery_path_utils/galleryPathUtils';
import { getDynamoDbTableName } from '../lambda_utils/Env';
import { GalleryItem, GalleryItemKey } from '../gallery/galleryTypes';

/** DynamoDB reserved words that need aliasing in expressions */
const RESERVED_WORDS = ['duration', 'id'] as const;

/**
 * Build ProjectionExpression and ExpressionAttributeNames with reserved word handling.
 * DynamoDB reserved words like 'duration' and 'id' must be aliased in expressions.
 */
function buildProjection(attributes: string[]): {
    ProjectionExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
} {
    const expressionAttributeNames: Record<string, string> = {};

    const projection = attributes.map((attr) => {
        if (RESERVED_WORDS.includes(attr as (typeof RESERVED_WORDS)[number])) {
            expressionAttributeNames[`#${attr}`] = attr;
            return `#${attr}`;
        }
        return attr;
    });

    return {
        ProjectionExpression: projection.join(','),
        ...(Object.keys(expressionAttributeNames).length > 0 && { ExpressionAttributeNames: expressionAttributeNames }),
    };
}

/**
 * Get the full contents of an album or image from DynamoDB
 * Does not retrieve any children.
 *
 * @param path path to album or image, like /2001/12-31/ or /2001/12-31/image.jpg
 */
export async function getFullItemFromDynamoDB<T extends GalleryItem>(path: string): Promise<T | undefined> {
    if (!isValidPath(path)) throw new Error(`Invalid path [${path}]`);
    return getItem<T>(path);
}

/**
 * Retrieve the specified attributes of the specified item from DynamoDB.
 * Does not retrieve any children.
 *
 * @param path Path of album or image to retrieve, like /2001/12-31/ or /2001/12-31/image.jpg
 * @param attributes Name of the attributes to include.  If blank, returns ALL attributes.
 */
export async function getItem<T extends GalleryItem>(
    path: string,
    attributes: (keyof T)[] = [],
): Promise<T | undefined> {
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
        const { ProjectionExpression, ExpressionAttributeNames } = buildProjection(attributes as string[]);
        ddbCommand.input.ProjectionExpression = ProjectionExpression;
        if (ExpressionAttributeNames) {
            ddbCommand.input.ExpressionAttributeNames = ExpressionAttributeNames;
        }
    }
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const result = await docClient.send(ddbCommand);
    return result.Item as T;
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
export async function getChildItems(
    albumPath: string,
    attributes: GalleryItemKey[] = [],
): Promise<GalleryItem[] | undefined> {
    if (!isValidAlbumPath(albumPath)) throw new Error(`Invalid album path [${albumPath}]`);
    const ddbCommand = new QueryCommand({
        TableName: getDynamoDbTableName(),
        KeyConditionExpression: 'parentPath = :parentPath',
        ExpressionAttributeValues: {
            ':parentPath': albumPath,
        },
    });
    if (attributes?.length && attributes?.length > 0) {
        const { ProjectionExpression, ExpressionAttributeNames } = buildProjection(attributes as string[]);
        ddbCommand.input.ProjectionExpression = ProjectionExpression;
        if (ExpressionAttributeNames) {
            ddbCommand.input.ExpressionAttributeNames = ExpressionAttributeNames;
        }
    }
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const results = await docClient.send(ddbCommand);
    return results?.Items as GalleryItem[] | undefined;
}
