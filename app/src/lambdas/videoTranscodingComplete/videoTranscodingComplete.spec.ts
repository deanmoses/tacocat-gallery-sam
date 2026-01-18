import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
    S3Client,
    DeleteObjectCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
    HeadObjectCommand,
    NotFound,
} from '@aws-sdk/client-s3';
import { MediaConvertClient, GetJobCommand, DescribeEndpointsCommand } from '@aws-sdk/client-mediaconvert';
import { handleVideoTranscodingComplete, MediaConvertJobStateChangeEvent } from './videoTranscodingComplete';

const mockDocClient = mockClient(DynamoDBDocumentClient);
const mockS3Client = mockClient(S3Client);
const mockMediaConvert = mockClient(MediaConvertClient);

beforeEach(() => {
    process.env.GALLERY_ITEM_DDB_TABLE = 'test-gallery-table';
    process.env.ERROR_TABLE = 'test-error-table';
    process.env.ORIGINAL_IMAGES_BUCKET = 'test-original-bucket';
    process.env.DERIVED_IMAGES_BUCKET = 'test-derived-bucket';

    mockDocClient.reset();
    mockS3Client.reset();
    mockMediaConvert.reset();

    // Default mocks
    mockDocClient.on(PutCommand).resolves({});
    mockDocClient.on(GetCommand).resolves({ Item: { thumbnail: { path: '/existing/thumb.jpg' } } }); // Album has existing thumbnail
    mockDocClient.on(UpdateCommand).resolves({});
    mockS3Client.on(DeleteObjectCommand).resolves({});
    mockS3Client.on(ListObjectsV2Command).resolves({ Contents: [] });
    mockS3Client.on(CopyObjectCommand).resolves({});
    mockS3Client.on(HeadObjectCommand).rejects(new NotFound({ $metadata: {}, message: 'Not Found' })); // Default: destination doesn't exist
    mockMediaConvert.on(DescribeEndpointsCommand).resolves({
        Endpoints: [{ Url: 'https://abc123.mediaconvert.us-east-1.amazonaws.com' }],
    });
});

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

function createCompleteEvent(
    overrides: Partial<MediaConvertJobStateChangeEvent['detail']> = {},
): MediaConvertJobStateChangeEvent {
    return {
        version: '0',
        id: 'test-event-id',
        'detail-type': 'MediaConvert Job State Change',
        source: 'aws.mediaconvert',
        account: '123456789012',
        time: '2024-06-15T12:00:00Z',
        region: 'us-east-1',
        detail: {
            status: 'COMPLETE',
            jobId: 'test-job-id',
            userMetadata: {
                path: '/2024/06-15/video.mp4',
                versionId: 'version123',
                id: VALID_UUID,
            },
            ...overrides,
        },
    };
}

describe('handleVideoTranscodingComplete()', () => {
    describe('On COMPLETE', () => {
        test('Writes DynamoDB record with correct fields', async () => {
            mockMediaConvert.on(GetJobCommand).resolves({
                Job: {
                    OutputGroupDetails: [
                        {
                            OutputDetails: [
                                {
                                    VideoDetails: {
                                        WidthInPx: 1920,
                                        HeightInPx: 1080,
                                    },
                                    DurationInMs: 120000, // 2 minutes
                                },
                            ],
                        },
                    ],
                } as never,
            });

            await handleVideoTranscodingComplete(createCompleteEvent());

            const updateCalls = mockDocClient.commandCalls(UpdateCommand);
            expect(updateCalls.length).toBeGreaterThanOrEqual(1);

            // Find the video record update
            const videoUpdate = updateCalls.find(
                (call) => call.args[0].input.ExpressionAttributeValues?.[':mediaType'] === 'video',
            );
            expect(videoUpdate).toBeDefined();

            const input = videoUpdate?.args[0].input;
            expect(input?.Key?.parentPath).toBe('/2024/06-15/');
            expect(input?.Key?.itemName).toBe('video.mp4');
            expect(input?.ExpressionAttributeValues?.[':itemType']).toBe('image'); // itemType is 'image' for all media
            expect(input?.ExpressionAttributeValues?.[':mediaType']).toBe('video'); // mediaType distinguishes videos from images
            expect(input?.ExpressionAttributeValues?.[':id']).toBe(VALID_UUID);
            expect(input?.ExpressionAttributeValues?.[':versionId']).toBe('version123');
            expect(input?.ExpressionAttributeValues?.[':dimensions']).toEqual({ width: 1920, height: 1080 });
            expect(input?.ExpressionAttributeValues?.[':duration']).toBe(120);
        });

        test('Extracts duration and dimensions from job metadata', async () => {
            mockMediaConvert.on(GetJobCommand).resolves({
                Job: {
                    OutputGroupDetails: [
                        {
                            OutputDetails: [
                                {
                                    VideoDetails: {
                                        WidthInPx: 3840,
                                        HeightInPx: 2160,
                                    },
                                    DurationInMs: 300000, // 5 minutes
                                },
                            ],
                        },
                    ],
                } as never,
            });

            await handleVideoTranscodingComplete(createCompleteEvent());

            const updateCalls = mockDocClient.commandCalls(UpdateCommand);
            const videoUpdate = updateCalls.find(
                (call) => call.args[0].input.ExpressionAttributeValues?.[':mediaType'] === 'video',
            );
            const values = videoUpdate?.args[0].input.ExpressionAttributeValues;
            expect(values?.[':dimensions']).toEqual({ width: 3840, height: 2160 });
            expect(values?.[':duration']).toBe(300);
        });

        test('Handles Lambda retry when rename already completed (idempotent)', async () => {
            // Simulate retry: destination files already exist from previous invocation
            mockS3Client.on(HeadObjectCommand).resolves({}); // Destination exists

            mockMediaConvert.on(GetJobCommand).resolves({
                Job: {
                    OutputGroupDetails: [
                        {
                            OutputDetails: [
                                {
                                    VideoDetails: { WidthInPx: 1920, HeightInPx: 1080 },
                                    DurationInMs: 60000,
                                },
                            ],
                        },
                    ],
                } as never,
            });

            // Should not throw, even though source files are gone
            await handleVideoTranscodingComplete(createCompleteEvent());

            // Should NOT have called CopyObjectCommand (destinations already exist)
            const copyCalls = mockS3Client.commandCalls(CopyObjectCommand);
            expect(copyCalls.length).toBe(0);

            // Should still call DeleteObjectCommand to clean up any remaining source files
            const deleteCalls = mockS3Client.commandCalls(DeleteObjectCommand);
            const derivedDeletes = deleteCalls.filter((call) => call.args[0].input.Bucket === 'test-derived-bucket');
            expect(derivedDeletes.length).toBe(2); // video and poster source files

            // DynamoDB record should still be written
            const updateCalls = mockDocClient.commandCalls(UpdateCommand);
            expect(updateCalls.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('On ERROR', () => {
        test('Writes to error table', async () => {
            const event = createCompleteEvent({
                status: 'ERROR',
                errorMessage: 'Unsupported codec',
            });

            await handleVideoTranscodingComplete(event);

            const putCalls = mockDocClient.commandCalls(PutCommand);
            const errorPut = putCalls.find((call) => call.args[0].input.TableName === 'test-error-table');
            expect(errorPut).toBeDefined();

            const item = errorPut?.args[0].input.Item;
            expect(item?.path).toBe('/2024/06-15/video.mp4');
            expect(item?.errorType).toBe('media_processing');
            expect(item?.errorMessage).toBe('Unsupported codec');
            expect(item?.ttl).toBeDefined();
        });

        test('Deletes original file', async () => {
            const event = createCompleteEvent({
                status: 'ERROR',
                errorMessage: 'Transcoding failed',
            });

            await handleVideoTranscodingComplete(event);

            const deleteCalls = mockS3Client.commandCalls(DeleteObjectCommand);
            const originalDelete = deleteCalls.find((call) => call.args[0].input.Bucket === 'test-original-bucket');
            expect(originalDelete).toBeDefined();
            expect(originalDelete?.args[0].input.Key).toBe('2024/06-15/video.mp4');
        });

        test('Deletes partial outputs from derived bucket', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({
                Contents: [{ Key: 'video/uuid-12345.mp4' }, { Key: 'video/uuid-12345.jpg' }],
            });

            const event = createCompleteEvent({
                status: 'ERROR',
                errorMessage: 'Transcoding failed',
            });

            await handleVideoTranscodingComplete(event);

            const deleteCalls = mockS3Client.commandCalls(DeleteObjectCommand);
            const derivedDeletes = deleteCalls.filter((call) => call.args[0].input.Bucket === 'test-derived-bucket');
            expect(derivedDeletes.length).toBe(2);
        });
    });

    describe('On CANCELED', () => {
        test('Handles same as ERROR', async () => {
            const event = createCompleteEvent({
                status: 'CANCELED',
            });

            await handleVideoTranscodingComplete(event);

            // Should write to error table
            const putCalls = mockDocClient.commandCalls(PutCommand);
            const errorPut = putCalls.find((call) => call.args[0].input.TableName === 'test-error-table');
            expect(errorPut).toBeDefined();
            expect(errorPut?.args[0].input.Item?.errorMessage).toContain('canceled');
        });
    });

    describe('Edge cases', () => {
        test('Handles missing userMetadata gracefully', async () => {
            const event = createCompleteEvent();
            event.detail.userMetadata = undefined;

            // Should not throw
            await handleVideoTranscodingComplete(event);

            // Should not write any records
            const putCalls = mockDocClient.commandCalls(PutCommand);
            expect(putCalls.length).toBe(0);
        });

        test('Handles partial userMetadata gracefully', async () => {
            const event = createCompleteEvent();
            event.detail.userMetadata = { path: '/2024/06-15/video.mp4' }; // missing versionId and id

            // Should not throw
            await handleVideoTranscodingComplete(event);

            // Should not write any records
            const putCalls = mockDocClient.commandCalls(PutCommand);
            expect(putCalls.length).toBe(0);
        });

        test('Throws on invalid UUID format', async () => {
            const event = createCompleteEvent({
                userMetadata: {
                    path: '/2024/06-15/video.mp4',
                    versionId: 'version123',
                    id: 'not-a-valid-uuid',
                },
            });

            await expect(handleVideoTranscodingComplete(event)).rejects.toThrow(/invalid uuid/i);
        });
    });
});
