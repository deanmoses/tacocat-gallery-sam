import { BadRequestException } from '../../api_gateway_utils/BadRequestException';
import { NotFoundException } from '../../api_gateway_utils/NotFoundException';
import { isValidImagePath } from '../../gallery_path_utils/pathValidator';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { buildUpdatePartiQL } from '../../dynamo_utils/DynamoUpdateBuilder';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ExecuteStatementCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Update an image's attributes (like title and description) in DynamoDB
 *
 * @param tableName Name of the table in DynamoDB containing gallery items
 * @param imagePath Path of the image to update, like /2001/12-31/image.jpg
 * @param attributesToUpdate bag of attributes to update
 */
export async function updateImage(
    tableName: string,
    imagePath: string,
    attributesToUpdate: Record<string, string | boolean>,
) {
    if (!imagePath) {
        throw new BadRequestException('No image path specified');
    }

    if (!isValidImagePath(imagePath)) {
        throw new BadRequestException(`Malformed image path: [${imagePath}]`);
    }

    if (!attributesToUpdate) {
        throw new BadRequestException('No attributes to update');
    }

    const keysToUpdate = Object.keys(attributesToUpdate);

    if (keysToUpdate.length === 0) {
        throw new BadRequestException('No attributes to update');
    }

    // Ensure only these attributes are in the input
    const validKeys = new Set(['title', 'description']);
    keysToUpdate.forEach((keyToUpdate) => {
        // Ensure we aren't trying to update an unknown attribute
        if (!validKeys.has(keyToUpdate)) {
            throw new BadRequestException('Unknown attribute: ' + keyToUpdate);
        }
    });

    //
    // Construct the DynamoDB update statement
    //

    attributesToUpdate['updatedOn'] = new Date().toISOString();
    const pathParts = getParentAndNameFromPath(imagePath);
    if (!pathParts.name) throw 'Expecting path to have a leaf, got none';
    const partiQL = buildUpdatePartiQL(tableName, pathParts.parent, pathParts.name, attributesToUpdate);
    const ddbCommand = new ExecuteStatementCommand({
        Statement: partiQL,
    });

    //
    // Send update to DynamoDB
    //

    try {
        const ddbClient = new DynamoDBClient({});
        const docClient = DynamoDBDocumentClient.from(ddbClient);
        const response = await docClient.send(ddbCommand);
        console.info('partiQL update response:', response);
    } catch (e) {
        if (e?.toString().includes('conditional')) {
            throw new NotFoundException('Image not found: ' + imagePath);
        } else {
            throw e;
        }
    }
}
