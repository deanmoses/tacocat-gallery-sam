import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
    S3Client,
    CopyObjectCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    HeadObjectCommand,
    NotFound,
} from '@aws-sdk/client-s3';

/** Event shape for direct Lambda invocation */
export interface VideoIdToPathEvent {
    /** Array of video paths like ["/2024/01-15/video.mp4", "/2024/02-20/another.mov"] */
    paths: string[];
}

interface VideoRecord {
    path: string;
    id?: string;
    versionId?: string;
}

interface MigrationResult {
    totalInput: number;
    migrated: number;
    skipped: number;
    failed: number;
    errors: string[];
}

// Hard-coded old path patterns (not using library functions being removed)
const getOldTranscodedKey = (id: string, versionId: string) => `d/${id}/${versionId}/video/transcoded`;
const getOldPosterKey = (id: string, versionId: string) => `d/${id}/${versionId}/video/poster`;
const getOldIdPrefix = (id: string) => `d/${id}/`;

// New path patterns
const getNewTranscodedKey = (path: string, versionId: string) => `i${path}/${versionId}/video-transcoded`;
const getNewPosterKey = (path: string, versionId: string) => `i${path}/${versionId}/video-poster`;

/**
 * Migration lambda to convert video storage from UUID-based to path-based.
 *
 * Invoke from AWS Console with:
 * { "paths": ["/2024/01-15/video.mp4", "/2024/02-20/another.mov"] }
 *
 * The migration is idempotent - videos that have already been migrated (no `id` field) are skipped.
 */
export const handler = async (event: VideoIdToPathEvent): Promise<MigrationResult> => {
    const tableName = process.env.GALLERY_ITEM_DDB_TABLE;
    const derivedBucket = process.env.DERIVED_IMAGES_BUCKET;

    if (!tableName) throw new Error('Missing GALLERY_ITEM_DDB_TABLE env var');
    if (!derivedBucket) throw new Error('Missing DERIVED_IMAGES_BUCKET env var');

    if (!event.paths || !Array.isArray(event.paths) || event.paths.length === 0) {
        throw new Error('Invalid input: must provide non-empty array of video paths');
    }

    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const s3Client = new S3Client({});

    console.info(JSON.stringify({ event: 'migration_started', totalPaths: event.paths.length }));

    // =========================================================================
    // Phase 1: Validate all inputs upfront
    // =========================================================================
    const videoRecords: VideoRecord[] = [];
    const toMigrate: VideoRecord[] = [];
    const alreadyMigrated: string[] = [];
    const errors: string[] = [];

    // Batch get all records (DynamoDB BatchGetItem limit is 100)
    const batchSize = 100;
    for (let i = 0; i < event.paths.length; i += batchSize) {
        const batch = event.paths.slice(i, i + batchSize);
        const keys = batch.map((path) => {
            const lastSlash = path.lastIndexOf('/');
            return {
                parentPath: path.substring(0, lastSlash + 1),
                itemName: path.substring(lastSlash + 1),
            };
        });

        const response = await docClient.send(
            new BatchGetCommand({
                RequestItems: {
                    [tableName]: { Keys: keys },
                },
            }),
        );

        const items = response.Responses?.[tableName] || [];

        // Map back to paths
        for (const path of batch) {
            const lastSlash = path.lastIndexOf('/');
            const parentPath = path.substring(0, lastSlash + 1);
            const itemName = path.substring(lastSlash + 1);

            const item = items.find((i) => i.parentPath === parentPath && i.itemName === itemName) as
                | Record<string, unknown>
                | undefined;

            if (!item) {
                const error = `Path not found in DynamoDB: ${path}`;
                console.error(JSON.stringify({ event: 'validation_error', path, error }));
                errors.push(error);
                continue;
            }

            if (!item.versionId) {
                const error = `Missing versionId in DynamoDB: ${path}`;
                console.error(JSON.stringify({ event: 'validation_error', path, error }));
                errors.push(error);
                continue;
            }

            const record: VideoRecord = {
                path,
                id: item.id as string | undefined,
                versionId: item.versionId as string,
            };
            videoRecords.push(record);

            if (!record.id) {
                console.info(JSON.stringify({ event: 'already_migrated', path }));
                alreadyMigrated.push(path);
            } else {
                toMigrate.push(record);
            }
        }
    }

    // Fail if any validation errors
    if (errors.length > 0) {
        console.error(
            JSON.stringify({
                event: 'validation_failed',
                totalErrors: errors.length,
                errors,
            }),
        );
        throw new Error(`Validation failed with ${errors.length} errors. See logs for details.`);
    }

    console.info(
        JSON.stringify({
            event: 'validation_complete',
            totalRecords: videoRecords.length,
            toMigrate: toMigrate.length,
            alreadyMigrated: alreadyMigrated.length,
        }),
    );

    // =========================================================================
    // Phase 2: Migrate each video
    // =========================================================================
    let migrated = 0;
    let failed = 0;
    const migrationErrors: string[] = [];

    for (const record of toMigrate) {
        const { path, id, versionId } = record;
        if (!id) continue; // Already migrated (shouldn't be in toMigrate, but safe to skip)
        if (!versionId) throw new Error(`Corrupt record missing versionId: ${path}`);

        try {
            console.info(JSON.stringify({ event: 'migrating_video', path, id, versionId }));

            // Verify source files exist before copying (fail fast if missing)
            const oldTranscodedKey = getOldTranscodedKey(id, versionId);
            const oldPosterKey = getOldPosterKey(id, versionId);

            const transcodedExists = await objectExists(s3Client, derivedBucket, oldTranscodedKey);
            const posterExists = await objectExists(s3Client, derivedBucket, oldPosterKey);

            if (!transcodedExists || !posterExists) {
                const missing = [];
                if (!transcodedExists) missing.push('transcoded');
                if (!posterExists) missing.push('poster');
                throw new Error(`Missing source files (${missing.join(', ')}): ${oldTranscodedKey}`);
            }

            // Copy transcoded video
            const newTranscodedKey = getNewTranscodedKey(path, versionId);
            await s3Client.send(
                new CopyObjectCommand({
                    Bucket: derivedBucket,
                    CopySource: `${derivedBucket}/${oldTranscodedKey}`,
                    Key: newTranscodedKey,
                }),
            );
            console.info(JSON.stringify({ event: 'copied_transcoded', from: oldTranscodedKey, to: newTranscodedKey }));

            // Copy poster
            const newPosterKey = getNewPosterKey(path, versionId);
            await s3Client.send(
                new CopyObjectCommand({
                    Bucket: derivedBucket,
                    CopySource: `${derivedBucket}/${oldPosterKey}`,
                    Key: newPosterKey,
                }),
            );
            console.info(JSON.stringify({ event: 'copied_poster', from: oldPosterKey, to: newPosterKey }));

            // Remove id field from DynamoDB record
            const lastSlash = path.lastIndexOf('/');
            await docClient.send(
                new UpdateCommand({
                    TableName: tableName,
                    Key: {
                        parentPath: path.substring(0, lastSlash + 1),
                        itemName: path.substring(lastSlash + 1),
                    },
                    UpdateExpression: 'REMOVE id SET updatedOn = :now',
                    ExpressionAttributeValues: {
                        ':now': new Date().toISOString(),
                    },
                }),
            );
            console.info(JSON.stringify({ event: 'removed_id_from_ddb', path }));

            // Delete all files under d/<id>/ prefix
            await deleteS3Prefix(s3Client, derivedBucket, getOldIdPrefix(id));
            console.info(JSON.stringify({ event: 'deleted_old_files', prefix: getOldIdPrefix(id) }));

            migrated++;
            console.info(JSON.stringify({ event: 'video_migrated', path }));
        } catch (error) {
            const errorMsg = `Failed to migrate ${path}: ${error instanceof Error ? error.message : String(error)}`;
            console.error(JSON.stringify({ event: 'migration_error', path, error: errorMsg }));
            migrationErrors.push(errorMsg);
            failed++;
        }
    }

    const result: MigrationResult = {
        totalInput: event.paths.length,
        migrated,
        skipped: alreadyMigrated.length,
        failed,
        errors: migrationErrors,
    };

    console.info(JSON.stringify({ event: 'migration_complete', ...result }));

    return result;
};

async function objectExists(client: S3Client, bucket: string, key: string): Promise<boolean> {
    try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
    } catch (error) {
        if (error instanceof NotFound) return false;
        throw error;
    }
}

async function deleteS3Prefix(client: S3Client, bucket: string, prefix: string): Promise<void> {
    const listResponse = await client.send(
        new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
        }),
    );

    const objects = listResponse.Contents || [];
    if (objects.length === 0) {
        console.info(JSON.stringify({ event: 'no_objects_to_delete', prefix }));
        return;
    }

    await client.send(
        new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
                Objects: objects.map((obj) => ({ Key: obj.Key })),
            },
        }),
    );

    console.info(JSON.stringify({ event: 'deleted_objects', prefix, count: objects.length }));
}
