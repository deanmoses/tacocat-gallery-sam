import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { NotFoundException } from '../../lambda_utils/NotFoundException';
import { getParentAndNameFromPath, isValidAlbumPath } from '../../gallery_path_utils/galleryPathUtils';
import { buildUpdatePartiQL } from '../../dynamo_utils/DynamoUpdateBuilder';
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ExecuteStatementCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';

/**
 * Update an album's attributes (like title and description) in DynamoDB
 *
 * @param albumPath Path of the album to update, like /2001/12-31/
 * @param attributesToUpdate bag of attributes to update
 */
export async function updateAlbum(albumPath: string, attributesToUpdate: Record<string, string | boolean>) {
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

    //
    // Ensure only these attributes are in the input
    //

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
    const tableName = getDynamoDbTableName();
    const partiQL = buildUpdatePartiQL(tableName, pathParts.parent, pathParts.name, attributesToUpdate);
    const ddbCommand = new ExecuteStatementCommand({
        Statement: partiQL,
    });

    //
    // Send update to DynamoDB
    //
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        await docClient.send(ddbCommand);
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            throw new NotFoundException(`Album not found: [${albumPath}]`);
        }
        throw e;
    }
}
