import { mockClient } from 'aws-sdk-client-mock';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { deleteOriginalAndDerivativesForMediaItem, deleteOriginalsAndDerivativesForAlbum } from './s3delete';

const mockS3Client = mockClient(S3Client);

afterEach(() => {
    mockS3Client.reset();
});

describe('deleteOriginalAndDerivatives with videoUuid', () => {
    describe('UUID validation prevents mass deletion', () => {
        // If UUID is empty or invalid, the S3 prefix could delete unintended assets.
        // deleteOriginalAndDerivatives uses Promise.allSettled for best-effort cleanup,
        // so it won't throw. Instead, we verify no S3 calls are made with invalid d/ prefix.

        test('Does not delete d/ prefix with empty string UUID', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivativesForMediaItem('/2001/12-31/video.mp4', '');

            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('d/'));
            expect(uuidFolderCalls).toHaveLength(0);
        });

        test('Does not delete d/ prefix with whitespace-only UUID', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivativesForMediaItem('/2001/12-31/video.mp4', '   ');

            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('d/'));
            expect(uuidFolderCalls).toHaveLength(0);
        });

        test('Does not delete d/ prefix with invalid UUID format', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivativesForMediaItem('/2001/12-31/video.mp4', 'not-a-uuid');

            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('d/'));
            expect(uuidFolderCalls).toHaveLength(0);
        });

        test('Does not delete d/ prefix with partial UUID', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivativesForMediaItem('/2001/12-31/video.mp4', '550e8400-e29b');

            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('d/'));
            expect(uuidFolderCalls).toHaveLength(0);
        });

        test('Deletes d/ prefix with valid UUID', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivativesForMediaItem(
                '/2001/12-31/video.mp4',
                '550e8400-e29b-41d4-a716-446655440000',
            );

            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('d/'));
            expect(uuidFolderCalls).toHaveLength(1);
            expect(uuidFolderCalls[0].args[0].input.Prefix).toBe('d/550e8400-e29b-41d4-a716-446655440000/');
        });
    });

    describe('undefined UUID skips video asset deletion', () => {
        test('Does not attempt to delete d/ prefix when UUID is undefined', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivativesForMediaItem('/2001/12-31/image.jpg', undefined);

            // Check that no S3 call was made with d/ prefix
            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('d/'));
            expect(uuidFolderCalls).toHaveLength(0);
        });
    });
});

describe('deleteOriginalsAndDerivativesForAlbum', () => {
    test('Deletes d/ prefix for videos when videoIds provided', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

        const videoUuid = '550e8400-e29b-41d4-a716-446655440000';
        await deleteOriginalsAndDerivativesForAlbum('/2001/12-31/', [videoUuid]);

        const calls = mockS3Client.commandCalls(ListObjectsV2Command);
        const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('d/'));
        expect(uuidFolderCalls).toHaveLength(1);
        expect(uuidFolderCalls[0].args[0].input.Prefix).toBe(`d/${videoUuid}/`);
    });

    test('Deletes multiple d/ prefixes when multiple videoIds provided', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

        const videoUuid1 = '550e8400-e29b-41d4-a716-446655440000';
        const videoUuid2 = '660e8400-e29b-41d4-a716-446655440001';
        await deleteOriginalsAndDerivativesForAlbum('/2001/12-31/', [videoUuid1, videoUuid2]);

        const calls = mockS3Client.commandCalls(ListObjectsV2Command);
        const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('d/'));
        expect(uuidFolderCalls).toHaveLength(2);
        const prefixes = uuidFolderCalls.map((call) => call.args[0].input.Prefix);
        expect(prefixes).toContain(`d/${videoUuid1}/`);
        expect(prefixes).toContain(`d/${videoUuid2}/`);
    });

    test('Does not delete d/ prefix when videoIds not provided', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

        await deleteOriginalsAndDerivativesForAlbum('/2001/12-31/');

        const calls = mockS3Client.commandCalls(ListObjectsV2Command);
        const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('d/'));
        expect(uuidFolderCalls).toHaveLength(0);
    });
});
