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

// Path-based storage: i/<path>/<versionId>/
const VIDEO_PATH = '/2024/06-15/video.mp4';
const VERSION_ID = 'version123';
const BASE_PREFIX = `i${VIDEO_PATH}/${VERSION_ID}`;

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

    // Default HeadObjectCommand behavior:
    // - Destination files (video-transcoded, video-poster) don't exist
    // - Source files have correct content types for content type verification
    mockS3Client
        .on(HeadObjectCommand, { Key: `${BASE_PREFIX}/video-transcoded` })
        .rejects(new NotFound({ $metadata: {}, message: 'Not Found' }));
    mockS3Client
        .on(HeadObjectCommand, { Key: `${BASE_PREFIX}/video-poster` })
        .rejects(new NotFound({ $metadata: {}, message: 'Not Found' }));
    mockS3Client
        .on(HeadObjectCommand, { Key: `${BASE_PREFIX}/video_transcoded.mp4` })
        .resolves({ ContentType: 'video/mp4' });
    mockS3Client
        .on(HeadObjectCommand, { Key: `${BASE_PREFIX}/video_poster.0000000.jpg` })
        .resolves({ ContentType: 'image/jpeg' });

    mockMediaConvert.on(DescribeEndpointsCommand).resolves({
        Endpoints: [{ Url: 'https://abc123.mediaconvert.us-east-1.amazonaws.com' }],
    });
});

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
                path: VIDEO_PATH,
                versionId: VERSION_ID,
                // No id field - path-based storage
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
            // No :id field - path-based storage
            expect(input?.ExpressionAttributeValues?.[':id']).toBeUndefined();
            expect(input?.ExpressionAttributeValues?.[':versionId']).toBe(VERSION_ID);
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
            // Override the default HeadObjectCommand mocks - all files exist (destinations exist, sources may be gone)
            mockS3Client.on(HeadObjectCommand).resolves({ ContentType: 'video/mp4' }); // All files exist

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
            expect(item?.path).toBe(VIDEO_PATH);
            expect(item?.errorType).toBe('media_processing');
            expect(item?.errorMessage).toBe('Unsupported codec');
            expect(item?.ttl).toBeDefined();
        });

        test('Reverts original file to previous version', async () => {
            const event = createCompleteEvent({
                status: 'ERROR',
                errorMessage: 'Transcoding failed',
            });

            await handleVideoTranscodingComplete(event);

            const deleteCalls = mockS3Client.commandCalls(DeleteObjectCommand);
            const originalDelete = deleteCalls.find((call) => call.args[0].input.Bucket === 'test-original-bucket');
            expect(originalDelete).toBeDefined();
            expect(originalDelete?.args[0].input.Key).toBe('2024/06-15/video.mp4');
            expect(originalDelete?.args[0].input.VersionId).toBe(VERSION_ID); // Uses specific version
        });

        test('Deletes partial outputs from derived bucket', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({
                Contents: [
                    { Key: `${BASE_PREFIX}/video_transcoded.mp4` },
                    { Key: `${BASE_PREFIX}/video_poster.0000000.jpg` },
                ],
            });

            const event = createCompleteEvent({
                status: 'ERROR',
                errorMessage: 'Transcoding failed',
            });

            await handleVideoTranscodingComplete(event);

            const listCalls = mockS3Client.commandCalls(ListObjectsV2Command);
            const derivedListCall = listCalls.find((call) => call.args[0].input.Bucket === 'test-derived-bucket');
            expect(derivedListCall?.args[0].input.Prefix).toBe(`${BASE_PREFIX}/`);

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
            event.detail.userMetadata = { path: VIDEO_PATH }; // missing versionId

            // Should not throw
            await handleVideoTranscodingComplete(event);

            // Should not write any records
            const putCalls = mockDocClient.commandCalls(PutCommand);
            expect(putCalls.length).toBe(0);
        });
    });

    describe('Content type verification', () => {
        test('Treats wrong video content type as failure', async () => {
            // Override to return wrong content type for video
            mockS3Client
                .on(HeadObjectCommand, { Key: `${BASE_PREFIX}/video_transcoded.mp4` })
                .resolves({ ContentType: 'application/octet-stream' });

            await handleVideoTranscodingComplete(createCompleteEvent());

            // Should write to error table
            const putCalls = mockDocClient.commandCalls(PutCommand);
            const errorPut = putCalls.find((call) => call.args[0].input.TableName === 'test-error-table');
            expect(errorPut).toBeDefined();
            expect(errorPut?.args[0].input.Item?.errorMessage).toContain('wrong content type');
            expect(errorPut?.args[0].input.Item?.errorMessage).toContain('video/*');

            // Should NOT write video DynamoDB record
            const updateCalls = mockDocClient.commandCalls(UpdateCommand);
            const videoUpdate = updateCalls.find(
                (call) => call.args[0].input.ExpressionAttributeValues?.[':mediaType'] === 'video',
            );
            expect(videoUpdate).toBeUndefined();
        });

        test('Treats wrong poster content type as failure', async () => {
            // Override to return wrong content type for poster
            mockS3Client
                .on(HeadObjectCommand, { Key: `${BASE_PREFIX}/video_poster.0000000.jpg` })
                .resolves({ ContentType: 'application/octet-stream' });

            await handleVideoTranscodingComplete(createCompleteEvent());

            // Should write to error table
            const putCalls = mockDocClient.commandCalls(PutCommand);
            const errorPut = putCalls.find((call) => call.args[0].input.TableName === 'test-error-table');
            expect(errorPut).toBeDefined();
            expect(errorPut?.args[0].input.Item?.errorMessage).toContain('wrong content type');
            expect(errorPut?.args[0].input.Item?.errorMessage).toContain('image/*');
        });

        test('Treats missing source video as failure', async () => {
            // Override to return NotFound for video source
            mockS3Client
                .on(HeadObjectCommand, { Key: `${BASE_PREFIX}/video_transcoded.mp4` })
                .rejects(new NotFound({ $metadata: {}, message: 'Not Found' }));

            await handleVideoTranscodingComplete(createCompleteEvent());

            // Should write to error table
            const putCalls = mockDocClient.commandCalls(PutCommand);
            const errorPut = putCalls.find((call) => call.args[0].input.TableName === 'test-error-table');
            expect(errorPut).toBeDefined();
            expect(errorPut?.args[0].input.Item?.errorMessage).toContain('not found');
        });

        test('Deletes partial outputs on content type failure', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({
                Contents: [
                    { Key: `${BASE_PREFIX}/video_transcoded.mp4` },
                    { Key: `${BASE_PREFIX}/video_poster.0000000.jpg` },
                ],
            });

            // Wrong content type triggers failure
            mockS3Client
                .on(HeadObjectCommand, { Key: `${BASE_PREFIX}/video_transcoded.mp4` })
                .resolves({ ContentType: 'text/plain' });

            await handleVideoTranscodingComplete(createCompleteEvent());

            // Should delete partial outputs
            const deleteCalls = mockS3Client.commandCalls(DeleteObjectCommand);
            const derivedDeletes = deleteCalls.filter((call) => call.args[0].input.Bucket === 'test-derived-bucket');
            expect(derivedDeletes.length).toBe(2);
        });

        test('Reverts original file on content type failure', async () => {
            // Wrong content type triggers failure
            mockS3Client
                .on(HeadObjectCommand, { Key: `${BASE_PREFIX}/video_transcoded.mp4` })
                .resolves({ ContentType: 'text/plain' });

            await handleVideoTranscodingComplete(createCompleteEvent());

            // Should revert original file
            const deleteCalls = mockS3Client.commandCalls(DeleteObjectCommand);
            const originalDelete = deleteCalls.find((call) => call.args[0].input.Bucket === 'test-original-bucket');
            expect(originalDelete).toBeDefined();
            expect(originalDelete?.args[0].input.Key).toBe('2024/06-15/video.mp4');
            expect(originalDelete?.args[0].input.VersionId).toBe(VERSION_ID);
        });
    });
});
