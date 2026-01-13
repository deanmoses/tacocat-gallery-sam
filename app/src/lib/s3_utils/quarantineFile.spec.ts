import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { quarantineFile } from './quarantineFile';

const mockS3Client = mockClient(S3Client);

beforeEach(() => {
    mockS3Client.reset();
});

describe('quarantineFile', () => {
    it('should copy file to quarantine/ prefix and delete original', async () => {
        mockS3Client.on(CopyObjectCommand).resolves({});
        mockS3Client.on(DeleteObjectCommand).resolves({});

        await quarantineFile('test-bucket', '2024/01-15/photo.heic');

        // Verify CopyObjectCommand was called with correct params
        const copyCalls = mockS3Client.commandCalls(CopyObjectCommand);
        expect(copyCalls).toHaveLength(1);
        expect(copyCalls[0].args[0].input).toEqual({
            Bucket: 'test-bucket',
            CopySource: 'test-bucket/2024/01-15/photo.heic',
            Key: 'quarantine/2024/01-15/photo.heic',
        });

        // Verify DeleteObjectCommand was called with correct params
        const deleteCalls = mockS3Client.commandCalls(DeleteObjectCommand);
        expect(deleteCalls).toHaveLength(1);
        expect(deleteCalls[0].args[0].input).toEqual({
            Bucket: 'test-bucket',
            Key: '2024/01-15/photo.heic',
        });
    });

    it('should handle nested paths correctly', async () => {
        mockS3Client.on(CopyObjectCommand).resolves({});
        mockS3Client.on(DeleteObjectCommand).resolves({});

        await quarantineFile('my-bucket', 'some/nested/path/file.jpg');

        const copyCalls = mockS3Client.commandCalls(CopyObjectCommand);
        expect(copyCalls[0].args[0].input.Key).toBe('quarantine/some/nested/path/file.jpg');
    });
});
