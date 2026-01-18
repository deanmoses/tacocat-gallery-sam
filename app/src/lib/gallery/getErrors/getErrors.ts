import { setTimeout } from 'node:timers/promises';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchGetCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { getErrorTableName } from '../../lambda_utils/Env';
import { isValidPath } from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';

export type GetErrorsRequest = {
    /** Gallery item paths (album, image, or video) to check for errors */
    paths: string[];
};

export type GetErrorsResponse = {
    errors: Record<string, string>;
};

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

/**
 * Get errors for the specified paths.
 * Only paths with errors are included in the response.
 *
 * @param paths Array of gallery item paths (album, image, or video) to check for errors
 * @returns Object mapping paths to error messages (only for paths that have errors)
 */
export async function getErrors(paths: string[]): Promise<GetErrorsResponse> {
    if (!paths || paths.length === 0) {
        throw new BadRequestException('paths is required');
    }

    if (paths.length > 500) {
        throw new BadRequestException('Maximum of 500 paths allowed per request');
    }

    // Validate all paths are valid gallery item paths (album, image, or video)
    for (const path of paths) {
        if (!isValidPath(path)) {
            throw new BadRequestException(`Invalid path: [${path}]`);
        }
    }

    // DynamoDB BatchGetItem has a limit of 100 items per request
    const MAX_BATCH_SIZE = 100;
    const errors: Record<string, string> = {};

    // Process in batches of 100
    for (let i = 0; i < paths.length; i += MAX_BATCH_SIZE) {
        const batch = paths.slice(i, i + MAX_BATCH_SIZE);
        const batchErrors = await getErrorBatch(batch);
        Object.assign(errors, batchErrors);
    }

    return { errors };
}

async function getErrorBatch(paths: string[]): Promise<Record<string, string>> {
    const tableName = getErrorTableName();
    const errors: Record<string, string> = {};

    let keysToFetch = paths.map((path) => ({ path }));
    let retryCount = 0;
    const MAX_RETRIES = 5;

    // Retry loop to handle UnprocessedKeys (can occur under throttling)
    while (keysToFetch.length > 0) {
        const ddbCommand = new BatchGetCommand({
            RequestItems: {
                [tableName]: {
                    Keys: keysToFetch,
                    ProjectionExpression: '#p, errorType, errorMessage',
                    ExpressionAttributeNames: { '#p': 'path' },
                },
            },
        });

        const result = await docClient.send(ddbCommand);

        result.Responses?.[tableName]?.forEach((item) => {
            if (item.path && item.errorMessage) {
                errors[item.path] = item.errorMessage;
            }
        });

        // Check for unprocessed keys and retry with exponential backoff
        const unprocessedKeys = result.UnprocessedKeys?.[tableName]?.Keys;
        if (unprocessedKeys && unprocessedKeys.length > 0) {
            retryCount++;
            if (retryCount > MAX_RETRIES) {
                console.error(
                    JSON.stringify({
                        event: 'batch_get_errors_max_retries',
                        maxRetries: MAX_RETRIES,
                        unprocessedCount: unprocessedKeys.length,
                    }),
                );
                break;
            }
            const delayMs = Math.min(100 * Math.pow(2, retryCount), 3000); // 200ms, 400ms, 800ms, 1600ms, 3000ms
            console.warn(
                JSON.stringify({
                    event: 'batch_get_errors_retry',
                    unprocessedCount: unprocessedKeys.length,
                    retryCount,
                    delayMs,
                }),
            );
            await setTimeout(delayMs);
            keysToFetch = unprocessedKeys as { path: string }[];
        } else {
            break;
        }
    }

    return errors;
}
