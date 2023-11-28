import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath, isValidImagePath } from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { ImageCreateRequest } from '../galleryTypes';

/**
 * Create image in DynamoDB
 *
 * @param imagePath Path of the image to update, like /2001/12-31/image.jpg
 * @param image attributes to update
 */
export async function createImage(imagePath: string, image: ImageCreateRequest): Promise<void> {
    if (!isValidImagePath(imagePath)) {
        throw new BadRequestException(`Malformed image path: [${imagePath}]`);
    }
    if (!image.versionId) {
        throw new BadRequestException(`Missing versionId`);
    }

    // Construct the DynamoDB command
    const pathParts = getParentAndNameFromPath(imagePath);
    if (!pathParts.name) throw 'Expecting path to have a leaf, got none';
    const now = new Date().toISOString();
    const ddbCommand = new PutCommand({
        TableName: getDynamoDbTableName(),
        Item: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
            itemType: 'image',
            createdOn: now,
            updatedOn: now,
            versionId: image.versionId,
        },
        ConditionExpression: 'attribute_not_exists (itemName)',
    });

    const item = ddbCommand.input.Item;
    if (!!item) {
        if (!!image.title) {
            item.title = image.title;
        }
        if (!!image.description) {
            item.description = image.description;
        }
        if (!!image.tags) {
            item.tags = image.tags;
        }
        if (!!image.dimensions) {
            item.dimensions = image.dimensions;
        }
    }

    // Send command to DynamoDB
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        await docClient.send(ddbCommand);
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            throw new BadRequestException(`Image already exists: [${imagePath}]`);
        }
        throw e;
    }
}
