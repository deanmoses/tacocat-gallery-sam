import { BadRequestException } from '../../api_gateway_utils/BadRequestException';
import { NotFoundException } from '../../api_gateway_utils/NotFoundException';
import { isValidAlbumPath } from '../../gallery_path_utils/pathValidator';
import { getParentAndNameFromPath } from '../../gallery_path_utils/getParentAndNameFromPath';
import { buildUpdatePartiQL } from '../../dynamo_utils/DynamoUpdateBuilder';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ExecuteStatementCommand } from '@aws-sdk/lib-dynamodb';

/**
 * Update an album's attributes (like title and description) in DynamoDB
 *
 * @param tableName Name of the table in DynamoDB containing gallery items
 * @param albumPath Path of the album to update, like /2001/12-31/
 * @param attributesToUpdate bag of attributes to update
 */
export async function updateAlbum(
    tableName: string,
    albumPath: string,
    attributesToUpdate: Record<string, string | boolean>,
) {
    if (!albumPath) {
        throw new BadRequestException('No album path specified');
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

    attributesToUpdate['updatedOn'] = new Date().toISOString();
    const pathParts = getParentAndNameFromPath(albumPath);
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
            throw new NotFoundException('Album not found: ' + albumPath);
        } else {
            throw e;
        }
    }
}
