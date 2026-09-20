import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { NotFoundException } from '../../lambda_utils/NotFoundException';
import {
    getParentAndNameFromPath,
    getParentFromPath,
    isValidAlbumPath,
    isValidDayAlbumPath,
} from '../../gallery_path_utils/galleryPathUtils';
import { ConditionalCheckFailedException, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { TransactWriteCommand, TransactWriteCommandInput, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { AlbumItem, AlbumUpdateRequest } from '../galleryTypes';
import { ddbDocClient } from '../../dynamo_utils/ddbClient';

type TransactUpdate = NonNullable<NonNullable<TransactWriteCommandInput['TransactItems']>[number]['Update']>;

/**
 * Update an album's attributes (like description and summary) in DynamoDB
 *
 * @param albumPath Path of the album to update, like /2001/12-31/
 * @param attributesToUpdate bag of attributes to update
 */
export async function updateAlbum(albumPath: string, attributesToUpdate: AlbumUpdateRequest) {
    console.info({ event: 'album_update_started', albumPath });
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Malformed album path: [${albumPath}]`);
    }

    if (albumPath === '/') {
        throw new BadRequestException('Invalid album path [/]: cannot update root album');
    }

    if (!attributesToUpdate) {
        throw new BadRequestException('No attributes to update');
    }

    const keysToUpdate = Object.keys(attributesToUpdate);
    if (keysToUpdate.length === 0) {
        throw new BadRequestException('No attributes to update');
    }

    const validKeys = new Set(['description', 'summary', 'published']);
    for (const keyToUpdate of keysToUpdate) {
        if (!validKeys.has(keyToUpdate)) {
            throw new BadRequestException('Unknown attribute: ' + keyToUpdate);
        }
        if (keyToUpdate === 'published' && typeof attributesToUpdate.published !== 'boolean') {
            throw new BadRequestException(
                `Invalid value: 'published' must be a boolean.  I got: [${attributesToUpdate.published}]`,
            );
        }
    }

    const attrs: Partial<AlbumItem> = { ...attributesToUpdate, updatedOn: new Date().toISOString() };
    const pathParts = getParentAndNameFromPath(albumPath);
    if (!pathParts.name) throw new Error('Expecting path to have a leaf, got none');
    const update = buildUpdate(pathParts.parent, pathParts.name, attrs);

    try {
        if (attributesToUpdate.published === true && isValidDayAlbumPath(albumPath)) {
            await publishDayAlbum(albumPath, update);
        } else {
            await ddbDocClient.send(new UpdateCommand(update));
        }
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            throw new NotFoundException(`Album not found: [${albumPath}]`);
        }
        throw e;
    }

    console.info({ event: 'album_updated', albumPath });
}

/** A day album may only be published while its year album is published */
async function publishDayAlbum(albumPath: string, update: TransactUpdate): Promise<void> {
    const yearPathParts = getParentAndNameFromPath(getParentFromPath(albumPath));
    const ddbCommand = new TransactWriteCommand({
        TransactItems: [
            {
                ConditionCheck: {
                    TableName: getDynamoDbTableName(),
                    Key: {
                        parentPath: yearPathParts.parent,
                        itemName: yearPathParts.name,
                    },
                    ConditionExpression: '#published = :published',
                    ExpressionAttributeNames: { '#published': 'published' },
                    ExpressionAttributeValues: { ':published': true },
                },
            },
            { Update: update },
        ],
    });
    try {
        await ddbDocClient.send(ddbCommand);
    } catch (e) {
        if (e instanceof TransactionCanceledException) {
            const [parentCheck, albumUpdate] = e.CancellationReasons ?? [];
            if (parentCheck?.Code === 'ConditionalCheckFailed') {
                throw new BadRequestException(`Cannot publish until parent is published`);
            }
            if (albumUpdate?.Code === 'ConditionalCheckFailed') {
                throw new NotFoundException(`Album not found: [${albumPath}]`);
            }
        }
        throw e;
    }
}

function buildUpdate(parentPath: string, itemName: string, fields: Partial<AlbumItem>): TransactUpdate {
    const sets: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(fields)) {
        sets.push(`#${field} = :${field}`);
        names[`#${field}`] = field;
        values[`:${field}`] = value;
    }
    return {
        TableName: getDynamoDbTableName(),
        Key: { parentPath, itemName },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists (itemName)',
    };
}
