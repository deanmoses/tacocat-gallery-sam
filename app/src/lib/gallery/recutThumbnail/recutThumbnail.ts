import { Rectangle } from '../../../lambdas/generateDerivedImage/focusCrop';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { NotFoundException } from '../../lambda_utils/NotFoundException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { getParentAndNameFromPath, isValidImagePath } from '../../gallery_path_utils/galleryPathUtils';

/**
 * Store thumbnail re-cut info about an image in DynamoDB
 */
export async function recutThumbnail(imagePath: string, crop: Rectangle) {
    console.info(`Re-cutting [${imagePath}] thumbnail]`);

    if (!isValidImagePath(imagePath)) {
        throw new BadRequestException(`Invalid image path [${imagePath}]`);
    }

    // Validate the input
    checkInt('x', crop.x);
    checkInt('y', crop.y);
    checkInt('width', crop.width);
    checkInt('height', crop.height);

    // Build the DynamoDB command
    const imagePathParts = getParentAndNameFromPath(imagePath);
    const ddbCommand = new UpdateCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: imagePathParts.parent,
            itemName: imagePathParts.name,
        },
        UpdateExpression: 'SET updatedOn = :updatedOn, thumbnail = :thumbnail',
        ExpressionAttributeValues: {
            ':updatedOn': new Date().toISOString(),
            ':thumbnail': {
                x: crop.x,
                y: crop.y,
                width: crop.width,
                height: crop.height,
            },
        },
        ConditionExpression: 'attribute_exists (itemName)',
    });

    // Send command to DynamoDB
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        await docClient.send(ddbCommand);
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            throw new NotFoundException(`Image not found: [${imagePath}]`);
        }
        throw e;
    }

    console.info(`Image [${imagePath}] thumbnail re-cut]`);
}

/**
 * Throw exception if the specified value isn't a positive integer
 */
function checkInt(name: string, value: unknown) {
    if (!isInt(value)) {
        throw new BadRequestException(`Invalid ${name} [${value}]`);
    }
}

/**
 * Return true if the passed-in thing is a positive integer
 */
function isInt(x: unknown): boolean {
    if (x === undefined) return false;
    if (typeof x === 'number' && Number.isInteger(x) && Math.sign(x) >= 0) return true;
    return false;
}
