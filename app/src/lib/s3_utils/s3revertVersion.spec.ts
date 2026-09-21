import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { revertS3Version } from './s3revertVersion';

const mockS3 = mockClient(S3Client);

beforeEach(() => {
    mockS3.reset();
    mockS3.on(DeleteObjectCommand).resolves({});
});

describe('revertS3Version()', () => {
    it('Deletes the specific S3 version', async () => {
        const result = await revertS3Version('test-bucket', '2024/06-15/photo.jpg', 'version123');

        expect(result).toBe(true);
        const deleteCalls = mockS3.commandCalls(DeleteObjectCommand);
        expect(deleteCalls).toHaveLength(1);
        expect(deleteCalls[0].args[0].input).toStrictEqual({
            Bucket: 'test-bucket',
            Key: '2024/06-15/photo.jpg',
            VersionId: 'version123',
        });
    });

    it('Returns false on S3 error', async () => {
        mockS3.on(DeleteObjectCommand).rejects(new Error('S3 error'));

        const result = await revertS3Version('test-bucket', '2024/06-15/photo.jpg', 'version123');

        expect(result).toBe(false);
    });

    it('Does not throw on S3 error', async () => {
        mockS3.on(DeleteObjectCommand).rejects(new Error('S3 error'));

        await expect(revertS3Version('test-bucket', '2024/06-15/photo.jpg', 'version123')).resolves.toBe(false);
    });
});
