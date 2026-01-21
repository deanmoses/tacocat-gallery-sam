import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { env } from './env';

const galleryTableName = env('GALLERY_ITEM_DDB_TABLE');

/**
 * Get the UUID for a video from DynamoDB.
 * The id is the S3 key like "2024/01-15/video.mp4" which maps to path "/2024/01-15/video.mp4".
 *
 * @param s3Key S3 key like "2024/01-15/video.mp4"
 * @returns UUID if found, undefined otherwise
 */
export const getVideoUuid = async (s3Key: string): Promise<string | undefined> => {
    // Convert S3 key to DynamoDB key parts
    // s3Key: "2024/01-15/video.mp4" -> parentPath: "/2024/01-15/", itemName: "video.mp4"
    const lastSlash = s3Key.lastIndexOf('/');
    if (lastSlash === -1) return undefined;

    const parentPath = '/' + s3Key.substring(0, lastSlash + 1);
    const itemName = s3Key.substring(lastSlash + 1);

    try {
        const ddbClient = new DynamoDBClient({});
        const docClient = DynamoDBDocumentClient.from(ddbClient);
        const result = await docClient.send(
            new GetCommand({
                TableName: galleryTableName,
                Key: { parentPath, itemName },
                ProjectionExpression: 'id',
            }),
        );
        const uuid = result.Item?.id as string | undefined;
        if (uuid) {
            console.info(JSON.stringify({ event: 'video_uuid_found', id: s3Key, uuid }));
        }
        return uuid;
    } catch (err) {
        console.error(JSON.stringify({ event: 'video_uuid_lookup_error', id: s3Key, error: String(err) }));
        throw err;
    }
};
