import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { NotFoundException } from '../../lambda_utils/NotFoundException';
import { getParentAndNameFromPath, isValidMediaPath } from '../../gallery_path_utils/galleryPathUtils';
import { buildUpdatePartiQL } from '../../dynamo_utils/DynamoUpdateBuilder';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ExecuteStatementCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';

/**
 * Update a media item's attributes (like title and description) in DynamoDB
 *
 * @param mediaPath Path of the media to update, like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 * @param attributesToUpdate bag of attributes to update
 */
export async function updateMedia(mediaPath: string, attributesToUpdate: Record<string, string | boolean>) {
    console.info(`Update Media: updating [${mediaPath}]...`);
    if (!isValidMediaPath(mediaPath)) {
        throw new BadRequestException(`Malformed media path: [${mediaPath}]`);
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
    const pathParts = getParentAndNameFromPath(mediaPath);
    if (!pathParts.name) throw 'Expecting path to have a leaf, got none';
    const partiQL = buildUpdatePartiQL(getDynamoDbTableName(), pathParts.parent, pathParts.name, attributesToUpdate);
    const ddbCommand = new ExecuteStatementCommand({
        Statement: partiQL,
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
            throw new NotFoundException('Media not found: ' + mediaPath);
        } else {
            throw e;
        }
    }
    console.info(`Update Media: updated [${mediaPath}]`);
}
