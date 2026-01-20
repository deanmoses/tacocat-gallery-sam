import { mockClient } from 'aws-sdk-client-mock';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { deleteOriginalAndDerivatives } from './s3delete';

const mockS3Client = mockClient(S3Client);

afterEach(() => {
    mockS3Client.reset();
});

describe('deleteOriginalAndDerivatives with videoUuid', () => {
    describe('UUID validation prevents mass deletion', () => {
        // If UUID is empty or invalid, the S3 prefix could delete unintended assets.
        // deleteOriginalAndDerivatives uses Promise.allSettled for best-effort cleanup,
        // so it won't throw. Instead, we verify no S3 calls are made with invalid u/ prefix.

        test('Does not delete u/ prefix with empty string UUID', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivatives('/2001/12-31/video.mp4', '');

            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('u/'));
            expect(uuidFolderCalls).toHaveLength(0);
        });

        test('Does not delete u/ prefix with whitespace-only UUID', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivatives('/2001/12-31/video.mp4', '   ');

            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('u/'));
            expect(uuidFolderCalls).toHaveLength(0);
        });

        test('Does not delete u/ prefix with invalid UUID format', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivatives('/2001/12-31/video.mp4', 'not-a-uuid');

            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('u/'));
            expect(uuidFolderCalls).toHaveLength(0);
        });

        test('Does not delete u/ prefix with partial UUID', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivatives('/2001/12-31/video.mp4', '550e8400-e29b');

            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('u/'));
            expect(uuidFolderCalls).toHaveLength(0);
        });

        test('Deletes u/ prefix with valid UUID', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivatives('/2001/12-31/video.mp4', '550e8400-e29b-41d4-a716-446655440000');

            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('u/'));
            expect(uuidFolderCalls).toHaveLength(1);
            expect(uuidFolderCalls[0].args[0].input.Prefix).toBe('u/550e8400-e29b-41d4-a716-446655440000/');
        });
    });

    describe('undefined UUID skips video asset deletion', () => {
        test('Does not attempt to delete u/ prefix when UUID is undefined', async () => {
            mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

            await deleteOriginalAndDerivatives('/2001/12-31/image.jpg', undefined);

            // Check that no S3 call was made with u/ prefix
            const calls = mockS3Client.commandCalls(ListObjectsV2Command);
            const uuidFolderCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('u/'));
            expect(uuidFolderCalls).toHaveLength(0);
        });
    });
});
