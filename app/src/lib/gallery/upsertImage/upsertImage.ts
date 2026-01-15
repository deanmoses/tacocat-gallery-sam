import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath, isValidImagePath } from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ImageCreateRequest } from '../galleryTypes';

/**
 * Merge existing and incoming tags, deduplicating and filtering out empty values.
 * Returns undefined if the result is empty (to avoid saving empty arrays).
 */
export function mergeTags(
    existingTags: string[] | undefined,
    incomingTags: string[] | undefined,
): string[] | undefined {
    const existing = existingTags ?? [];
    const incoming = incomingTags ?? [];
    const merged = [...new Set([...existing, ...incoming])].filter((tag) => tag != null && tag.trim() !== '');
    return merged.length > 0 ? merged : undefined;
}

/**
 * Create or update an image in DynamoDB.
 * If update, only overwrite fields that are not already set (except tags which are merged).
 *
 * @param imagePath Path of the image to update, like /2001/12-31/image.jpg
 * @param image attributes to update
 */
export async function upsertImage(imagePath: string, image: ImageCreateRequest): Promise<void> {
    if (!isValidImagePath(imagePath)) {
        throw new BadRequestException(`Invalid image path: [${imagePath}]`);
    }
    if (!image?.versionId) {
        throw new BadRequestException(`Missing versionId`);
    }
    const validKeys = new Set(['versionId', 'title', 'description', 'tags', 'dimensions']);
    Object.keys(image).forEach((key) => {
        if (!validKeys.has(key)) throw new BadRequestException(`Invalid attribute: [${key}]`);
    });

    const pathParts = getParentAndNameFromPath(imagePath);
    if (!pathParts.name) throw 'Expecting path to have a leaf, got none';

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);

    // Fetch existing tags to merge with incoming tags
    const getCommand = new GetCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
        ProjectionExpression: 'tags',
    });
    const existingItem = await docClient.send(getCommand);
    const existingTags = existingItem.Item?.tags as string[] | undefined;

    // Construct the DynamoDB update command
    const now = new Date().toISOString();
    const ddbCommand = new UpdateCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
        UpdateExpression:
            'SET' +
            ` versionId = :versionId` +
            ', updatedOn = :updatedOn' +
            `, createdOn = if_not_exists(createdOn, :createdOn)` +
            `, itemType = if_not_exists(itemType, :itemType)`,
        ExpressionAttributeValues: {
            ':versionId': image.versionId,
            ':updatedOn': now,
            ':createdOn': now,
            ':itemType': 'image',
        },
    });
    let updateExpression = ddbCommand.input.UpdateExpression;
    const expressionAttributeValues = ddbCommand.input.ExpressionAttributeValues;
    if (!updateExpression || !expressionAttributeValues) throw new Error('Malformed UpdateCommand');
    if (image.title) {
        updateExpression += `, title = if_not_exists(title, :title)`;
        expressionAttributeValues[':title'] = image.title;
    }
    if (image.description) {
        updateExpression += `, description = if_not_exists(description, :description)`;
        expressionAttributeValues[':description'] = image.description;
    }
    const mergedTags = mergeTags(existingTags, image.tags);
    if (mergedTags) {
        updateExpression += `, tags = :tags`;
        expressionAttributeValues[':tags'] = mergedTags;
    }
    if (image.dimensions) {
        updateExpression += `, dimensions = :dimensions`;
        expressionAttributeValues[':dimensions'] = image.dimensions;
    }
    ddbCommand.input.UpdateExpression = updateExpression;

    // Send update command to DynamoDB
    await docClient.send(ddbCommand);
}
