import { mockClient } from 'aws-sdk-client-mock';
import { MediaConvertClient, CreateJobCommand, DescribeEndpointsCommand } from '@aws-sdk/client-mediaconvert';
import { processVideoUpload } from './processVideoUpload';

const mockMediaConvert = mockClient(MediaConvertClient);

beforeEach(() => {
    process.env.GALLERY_ITEM_DDB_TABLE = 'test-gallery-table';
    process.env.MEDIA_CONVERT_ROLE_ARN = 'arn:aws:iam::123456789012:role/MediaConvertRole';
    process.env.DERIVED_IMAGES_BUCKET = 'test-derived-bucket';
    process.env.ORIGINAL_IMAGES_BUCKET = 'test-original-bucket';

    mockMediaConvert.reset();

    // Default mock for MediaConvert endpoint
    mockMediaConvert.on(DescribeEndpointsCommand).resolves({
        Endpoints: [{ Url: 'https://abc123.mediaconvert.us-east-1.amazonaws.com' }],
    });

    // Default mock for CreateJob - resolves without needing full Job object
    mockMediaConvert.on(CreateJobCommand).resolves({});
});

describe('processVideoUpload()', () => {
    test('Creates MediaConvert job for valid video upload', async () => {
        await processVideoUpload('test-bucket', '2024/06-15/video.mp4', 'version123');

        const createJobCalls = mockMediaConvert.commandCalls(CreateJobCommand);
        expect(createJobCalls.length).toBe(1);

        const jobInput = createJobCalls[0].args[0].input;
        expect(jobInput.Role).toBe('arn:aws:iam::123456789012:role/MediaConvertRole');
        expect(jobInput.UserMetadata?.source).toBe('test-derived-bucket'); // For EventBridge filtering
        expect(jobInput.UserMetadata?.path).toBe('/2024/06-15/video.mp4');
        expect(jobInput.UserMetadata?.versionId).toBe('version123');
        // No id field in UserMetadata anymore - path-based storage
        expect(jobInput.UserMetadata?.id).toBeUndefined();
    });

    test('Passes correct S3 paths to MediaConvert job', async () => {
        await processVideoUpload('test-bucket', '2024/06-15/my-video.mov', 'version456');

        const createJobCalls = mockMediaConvert.commandCalls(CreateJobCommand);
        const jobInput = createJobCalls[0].args[0].input;

        expect(jobInput.Settings?.Inputs?.[0]?.FileInput).toBe('s3://test-bucket/2024/06-15/my-video.mov');
    });

    test('Uses path-based output location', async () => {
        await processVideoUpload('test-bucket', '2024/06-15/video.mp4', 'version123');

        const createJobCalls = mockMediaConvert.commandCalls(CreateJobCommand);
        const jobInput = createJobCalls[0].args[0].input;

        // Output should be path-based: i/<path>/<versionId>/
        const mp4OutputGroup = jobInput.Settings?.OutputGroups?.find((g) => g.Name === 'MP4 Output');
        expect(mp4OutputGroup?.OutputGroupSettings?.FileGroupSettings?.Destination).toBe(
            's3://test-derived-bucket/i/2024/06-15/video.mp4/version123/',
        );
    });

    test('Throws error for invalid video path', async () => {
        await expect(processVideoUpload('test-bucket', 'invalid-path.mp4', 'version123')).rejects.toThrow(
            'invalid video path',
        );
    });

    test('Throws error for missing bucket', async () => {
        await expect(processVideoUpload('', '2024/06-15/video.mp4', 'version123')).rejects.toThrow('invalid bucket');
    });

    test('Throws error for missing versionId', async () => {
        await expect(processVideoUpload('test-bucket', '2024/06-15/video.mp4', undefined)).rejects.toThrow(
            'missing versionId',
        );
    });

    test('Configures MP4 output with H.264 codec', async () => {
        await processVideoUpload('test-bucket', '2024/06-15/video.mp4', 'version123');

        const createJobCalls = mockMediaConvert.commandCalls(CreateJobCommand);
        const jobInput = createJobCalls[0].args[0].input;

        const mp4OutputGroup = jobInput.Settings?.OutputGroups?.find((g) => g.Name === 'MP4 Output');
        expect(mp4OutputGroup).toBeDefined();
        expect(mp4OutputGroup?.Outputs?.[0]?.VideoDescription?.CodecSettings?.Codec).toBe('H_264');
        expect(mp4OutputGroup?.Outputs?.[0]?.ContainerSettings?.Container).toBe('MP4');
    });

    test('Configures thumbnail/poster output', async () => {
        await processVideoUpload('test-bucket', '2024/06-15/video.mp4', 'version123');

        const createJobCalls = mockMediaConvert.commandCalls(CreateJobCommand);
        const jobInput = createJobCalls[0].args[0].input;

        const thumbnailOutputGroup = jobInput.Settings?.OutputGroups?.find((g) => g.Name === 'Thumbnail Output');
        expect(thumbnailOutputGroup).toBeDefined();
        expect(thumbnailOutputGroup?.Outputs?.[0]?.VideoDescription?.CodecSettings?.Codec).toBe('FRAME_CAPTURE');
    });
});
