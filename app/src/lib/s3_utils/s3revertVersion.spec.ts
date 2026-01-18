import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { revertS3Version } from './s3revertVersion';

const mockS3 = mockClient(S3Client);

beforeEach(() => {
    mockS3.reset();
    mockS3.on(DeleteObjectCommand).resolves({});
});

describe('revertS3Version()', () => {
    test('Deletes the specific S3 version', async () => {
        const result = await revertS3Version('test-bucket', '2024/06-15/photo.jpg', 'version123');

        expect(result).toBe(true);
        const deleteCalls = mockS3.commandCalls(DeleteObjectCommand);
        expect(deleteCalls.length).toBe(1);
        expect(deleteCalls[0].args[0].input).toEqual({
            Bucket: 'test-bucket',
            Key: '2024/06-15/photo.jpg',
            VersionId: 'version123',
        });
    });

    test('Returns false on S3 error', async () => {
        mockS3.on(DeleteObjectCommand).rejects(new Error('S3 error'));

        const result = await revertS3Version('test-bucket', '2024/06-15/photo.jpg', 'version123');

        expect(result).toBe(false);
    });

    test('Does not throw on S3 error', async () => {
        mockS3.on(DeleteObjectCommand).rejects(new Error('S3 error'));

        await expect(revertS3Version('test-bucket', '2024/06-15/photo.jpg', 'version123')).resolves.toBe(false);
    });
});
