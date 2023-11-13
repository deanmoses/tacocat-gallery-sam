import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getParentAndNameFromPath, isValidAlbumPath } from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getDynamoDbTableName } from '../../lambda_utils/Env';

/**
 * Create album, but don't throw an exception if it already exists.
 *
 * @param albumPath path of the album, like '/2001/12-31/'
 * @returns true if album was created; false if it already exists
 */
export async function createAlbumNoThrow(albumPath: string): Promise<boolean> {
    return createAlbum(albumPath, undefined, false);
}

/**
 * Create album in DynamoDB
 *
 * @param albumPath path of the album, like '/2001/12-31/'
 * @param attributesToSet album attributes to set
 * @param throwIfExists true: throw Error if album already exists (default)
 * @returns true if album was created; false if it already exists
 */
export async function createAlbum(
    albumPath: string,
    attributesToSet?: Record<string, string | boolean>,
    throwIfExists = true,
): Promise<boolean> {
    if (!isValidAlbumPath(albumPath)) {
        throw new BadRequestException(`Invalid album path: [${albumPath}]`);
    }
    if (albumPath === '/') {
        throw new BadRequestException('Invalid album path: cannot create root album');
    }

    if (!!attributesToSet) {
        const keysToUpdate = Object.keys(attributesToSet);

        //
        // Ensure only these attributes are in the input
        //
        const validKeys = new Set(['title', 'description', 'summary', 'published']);
        keysToUpdate.forEach((keyToUpdate) => {
            // Ensure we aren't trying to update an unknown attribute
            if (!validKeys.has(keyToUpdate)) {
                throw new BadRequestException('Unknown attribute: ' + keyToUpdate);
            }

            // If published is being modified, ensure new value is valid
            if (keyToUpdate === 'published') {
                if (typeof attributesToSet.published !== 'boolean') {
                    throw new BadRequestException(
                        `Invalid value: 'published' must be a boolean.  I got: [${attributesToSet.published}]`,
                    );
                }
            }
        });
    }

    const pathParts = getParentAndNameFromPath(albumPath);
    const now = new Date().toISOString();
    const ddbCommand = new PutCommand({
        TableName: getDynamoDbTableName(),
        Item: {
            parentPath: pathParts.parent,
            itemName: pathParts.name,
            itemType: 'album',
            createdOn: now,
            updatedOn: now,
        },
        ConditionExpression: 'attribute_not_exists (itemName)',
    });
    if (ddbCommand?.input?.Item) {
        if (!!attributesToSet?.title) ddbCommand.input.Item.title = attributesToSet?.title;
        if (!!attributesToSet?.description) ddbCommand.input.Item.description = attributesToSet?.description;
        if (!!attributesToSet?.summary) ddbCommand.input.Item.summary = attributesToSet?.summary;
        if (!!attributesToSet?.published) ddbCommand.input.Item.published = attributesToSet?.published;
    }
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    try {
        await docClient.send(ddbCommand);
        console.info(`Create Album: created [${albumPath}]`);
        return true;
    } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
            console.info(`Create Album: already exists [${albumPath}]`);
            if (throwIfExists) {
                throw new BadRequestException(`Album already exists: [${albumPath}]`);
            }
        } else {
            throw e;
        }
    }
    return false;
}
