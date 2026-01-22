import { mockClient } from 'aws-sdk-client-mock';
import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import {
    deleteOriginalAndDerivativesForMediaItem,
    deleteOriginalsAndDerivativesForAlbum,
    deleteDerivedFilesByPathAndVersion,
} from './s3delete';

const mockS3Client = mockClient(S3Client);

afterEach(() => {
    mockS3Client.reset();
});

describe('deleteOriginalAndDerivativesForMediaItem', () => {
    test('Deletes derived files with i/ prefix for images', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

        await deleteOriginalAndDerivativesForMediaItem('/2001/12-31/image.jpg');

        const calls = mockS3Client.commandCalls(ListObjectsV2Command);
        // One ListObjectsV2Command for derived files (original uses DeleteObjectCommand directly)
        expect(calls.length).toBe(1);
        // Derived files prefix is i/<path> without trailing slash (for media items)
        expect(calls[0].args[0].input.Prefix).toBe('i/2001/12-31/image.jpg');
    });

    test('Deletes derived files with i/ prefix for videos', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

        await deleteOriginalAndDerivativesForMediaItem('/2001/12-31/video.mp4');

        const calls = mockS3Client.commandCalls(ListObjectsV2Command);
        const derivedCalls = calls.filter((call) => call.args[0].input.Prefix?.startsWith('i/'));
        expect(derivedCalls.length).toBe(1);
        expect(derivedCalls[0].args[0].input.Prefix).toBe('i/2001/12-31/video.mp4');
    });
});

describe('deleteOriginalsAndDerivativesForAlbum', () => {
    test('Deletes album contents from both buckets', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

        await deleteOriginalsAndDerivativesForAlbum('/2001/12-31/');

        const calls = mockS3Client.commandCalls(ListObjectsV2Command);
        // Should delete from originals and derived (both use ListObjectsV2 for folder deletion)
        expect(calls.length).toBe(2);
    });
});

describe('deleteDerivedFilesByPathAndVersion', () => {
    test('Deletes derived files for specific path and version', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({ KeyCount: 0 });

        await deleteDerivedFilesByPathAndVersion('/2001/12-31/video.mp4', 'version123');

        const calls = mockS3Client.commandCalls(ListObjectsV2Command);
        const derivedCall = calls.find((call) => call.args[0].input.Prefix?.includes('version123'));
        expect(derivedCall).toBeDefined();
        expect(derivedCall?.args[0].input.Prefix).toBe('i/2001/12-31/video.mp4/version123/');
    });

    test('Throws error for invalid media path', async () => {
        await expect(deleteDerivedFilesByPathAndVersion('invalid-path', 'version123')).rejects.toThrow(
            'invalid media path',
        );
    });
});
