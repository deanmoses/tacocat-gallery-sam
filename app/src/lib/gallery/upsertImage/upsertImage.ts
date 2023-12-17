import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath, isValidImagePath } from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ImageCreateRequest } from '../galleryTypes';

/**
 * Create or update an image in DynamoDB.
 * If update, only overwrite fields that are not already set.
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

    // Construct the DynamoDB command
    const pathParts = getParentAndNameFromPath(imagePath);
    if (!pathParts.name) throw 'Expecting path to have a leaf, got none';
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
    if (!!image.title) {
        updateExpression += `, title = if_not_exists(title, :title)`;
        expressionAttributeValues[':title'] = image.title;
    }
    if (!!image.description) {
        updateExpression += `, description = if_not_exists(description, :description)`;
        expressionAttributeValues[':description'] = image.description;
    }
    if (!!image.tags) {
        updateExpression += `, tags = if_not_exists(tags, :tags)`;
        expressionAttributeValues[':tags'] = image.tags;
    }
    if (!!image.dimensions) {
        updateExpression += `, dimensions = :dimensions`;
        expressionAttributeValues[':dimensions'] = image.dimensions;
    }
    ddbCommand.input.UpdateExpression = updateExpression;

    // Send command to DynamoDB
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    await docClient.send(ddbCommand);
}
