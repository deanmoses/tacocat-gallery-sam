import { NotFoundException } from '../../api_gateway_utils/NotFoundException';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoUpdateBuilder } from '../../dynamo_utils/DynamoUpdateBuilder';
import { BadRequestException } from '../../api_gateway_utils/BadRequestException';

/**
 * Update an album's attributes (like title and description) in DynamoDB
 *
 * @param tableName Name of the table in DynamoDB containing gallery items
 * @param albumPath Path of the album to update, like /2001/12-31/
 * @param attributesToUpdate bag of attributes to update
 *
 * @returns success message
 */
export async function updateAlbum(
    tableName: string,
    albumPath: string,
    attributesToUpdate: Record<string, string | boolean>,
) {
    //
    // Validate the input
    //

    if (!albumPath) {
        throw new BadRequestException('Must specify album');
    }

    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Cannot update root album');
    }

    if (!attributesToUpdate) {
        throw new BadRequestException('No attributes to update');
    }

    const keysToUpdate = Object.keys(attributesToUpdate);

    if (keysToUpdate.length === 0) {
        throw new BadRequestException('No attributes to update');
    }

    // Ensure only these attributes are in the input
    const validKeys = new Set(['title', 'description', 'published']);
    keysToUpdate.forEach((keyToUpdate) => {
        // Ensure we aren't trying to update an unknown attribute
        if (!validKeys.has(keyToUpdate)) {
            throw new BadRequestException('Unknown attribute: ' + keyToUpdate);
        }

        // If published is being modified, ensure new value is valid
        if (keyToUpdate === 'published') {
            if (typeof attributesToUpdate.published !== 'boolean') {
                throw new BadRequestException(
                    `Invalid value: 'published' must be a boolean.  I got: [${attributesToUpdate.published}]`,
                );
            }
        }
    });

    //
    // Construct the DynamoDB update statement
    //

    const bldr = new DynamoUpdateBuilder();
    bldr.add('updatedOn', new Date().toISOString());
    keysToUpdate.forEach((keyToUpdate) => {
        bldr.add(keyToUpdate, attributesToUpdate[keyToUpdate]);
    });

    const pathParts = getParentAndNameFromPath(albumPath);

    const ddbCommand = new UpdateCommand({
        TableName: tableName,
        Key: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
        },
        UpdateExpression: bldr.getUpdateExpression(),
        ExpressionAttributeValues: bldr.getExpressionAttributeValues(),
        ConditionExpression: 'attribute_exists (itemName)',
    });

    //
    // Send update to DynamoDB
    //

    try {
        const ddbClient = new DynamoDBClient({});
        const docClient = DynamoDBDocumentClient.from(ddbClient);
        await docClient.send(ddbCommand);
    } catch (e) {
        if (e?.toString().includes('conditional')) {
            throw new NotFoundException('Album not found: ' + albumPath);
        } else {
            throw e;
        }
    }
}
