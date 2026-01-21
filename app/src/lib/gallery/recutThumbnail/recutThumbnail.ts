import { Rectangle } from '../../../lambdas/generateDerivedImage/focusCrop';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { NotFoundException } from '../../lambda_utils/NotFoundException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { getParentAndNameFromPath, isValidMediaPath } from '../../gallery_path_utils/galleryPathUtils';
import { getItem } from '../../dynamo_utils/ddbGet';
import { ImageItem, Size } from '../galleryTypes';
import { ServerException } from '../../lambda_utils/ServerException';

/**
 * Store thumbnail re-cut info about an image in DynamoDB
 *
 * @crop rectangle specified in percent of image
 */
export async function recutThumbnail(mediaPath: string, cropInPct: Rectangle) {
    console.info(`Re-cutting [${mediaPath}] thumbnail]`);

    if (!isValidMediaPath(mediaPath)) {
        throw new BadRequestException(`Invalid media path [${mediaPath}]`);
    }

    checkPercent('x', cropInPct.x);
    checkPercent('y', cropInPct.y);
    checkPercent('width', cropInPct.width);
    checkPercent('height', cropInPct.height);

    // Get original image dimensions so I can convert from percent to pixels
    const image = await getItem<ImageItem>(mediaPath, ['dimensions']);
    if (!image) {
        throw new NotFoundException(`Image not found: [${mediaPath}]`);
    }
    if (!image.dimensions) {
        throw new ServerException(`Image dimensions not found: [${mediaPath}]`);
    }

    // Build DynamoDB command
    const mediaPathParts = getParentAndNameFromPath(mediaPath);
    const ddbCommand = new UpdateCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: mediaPathParts.parent,
            itemName: mediaPathParts.name,
        },
        UpdateExpression: 'SET updatedOn = :updatedOn, thumbnail = :thumbnail',
        ExpressionAttributeValues: {
            ':updatedOn': new Date().toISOString(),
            ':thumbnail': toPixelsFromPctCrop(cropInPct, image.dimensions),
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
            throw new NotFoundException(`Image not found: [${mediaPath}]`);
        }
        throw e;
    }

    console.info(`Image [${mediaPath}] thumbnail re-cut]`);
}

/**
 * Throw exception if the specified value isn't a positive number
 */
function checkPercent(name: string, value: unknown) {
    if (!isPercent(value)) {
        throw new BadRequestException(`Invalid ${name} [${value}]`);
    }
}

/**
 * Return true if the passed-in thing is a positive float
 */
function isPercent(x: unknown): boolean {
    return x !== undefined && typeof x === 'number' && Math.sign(x) >= 0 && x <= 100;
}

/**
 * Return crop rectangle in pixels from a crop rectangle specified in percent
 */
export function toPixelsFromPctCrop(cropInPct: Rectangle, pixels: Size): Rectangle {
    return {
        x: toPixelsFromPct(cropInPct.x, pixels.width),
        y: toPixelsFromPct(cropInPct.y, pixels.height),
        width: toPixelsFromPct(cropInPct.width, pixels.width),
        height: toPixelsFromPct(cropInPct.height, pixels.height),
    };
}

function toPixelsFromPct(pct: number, pixels: number): number {
    return Math.round(pct * 0.01 * pixels);
}
