import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getErrorTableName } from '../lambda_utils/Env';

/**
 * Types of errors that can be recorded in the error table.
 */
export enum ErrorType {
    MediaProcessing = 'media_processing',
}

/**
 * DynamoDB TTL for error records, in seconds.
 * DynamoDB will auto-delete records after this duration.
 * 24 hours is long enough for the UI to see it; any longer, use CloudWatch logs.
 */
const ERROR_TTL_SECONDS = 24 * 60 * 60; // 24 hours

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

/**
 * Record an error to the error table.
 * Does not throw on failure - logs error and returns false.
 *
 * @param errorType Type of error
 * @param path Path associated with the error (e.g., '/2024/06-15/photo.jpg')
 * @param errorMessage Error message to record
 * @returns true if recorded successfully, false otherwise
 */
export async function recordError(errorType: ErrorType, path: string, errorMessage: string): Promise<boolean> {
    try {
        await docClient.send(
            new PutCommand({
                TableName: getErrorTableName(),
                Item: {
                    path,
                    errorType,
                    errorMessage,
                    timestamp: new Date().toISOString(),
                    ttl: Math.floor(Date.now() / 1000) + ERROR_TTL_SECONDS,
                },
            }),
        );
        console.info(JSON.stringify({ event: 'error_recorded', errorType, path }));
        return true;
    } catch (error) {
        console.error(JSON.stringify({ event: 'error_record_failed', errorType, path, error: String(error) }));
        return false;
    }
}

/**
 * Record a media processing error to the error table.
 * Convenience wrapper around recordError for media processing errors.
 * Does not throw on failure - logs error and returns false.
 *
 * @param path Path to the media file (e.g., '/2024/06-15/photo.jpg')
 * @param errorMessage Error message to record
 * @returns true if recorded successfully, false otherwise
 */
export async function recordMediaProcessingError(path: string, errorMessage: string): Promise<boolean> {
    return recordError(ErrorType.MediaProcessing, path, errorMessage);
}
