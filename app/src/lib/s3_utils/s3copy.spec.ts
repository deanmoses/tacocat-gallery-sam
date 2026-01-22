import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, CopyObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { copyDerivedAssets } from './s3copy';

const mockS3Client = mockClient(S3Client);

beforeEach(() => {
    process.env.DERIVED_IMAGES_BUCKET = 'test-derived-bucket';
    mockS3Client.reset();
});

describe('copyDerivedAssets', () => {
    test('copies all objects from old prefix to new prefix', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({
            Contents: [
                { Key: 'i/2001/12-31/video.mp4/oldVersion/video-transcoded' },
                { Key: 'i/2001/12-31/video.mp4/oldVersion/video-poster' },
            ],
        });
        mockS3Client.on(CopyObjectCommand).resolves({});

        await copyDerivedAssets('/2001/12-31/video.mp4', '/2001/12-31/newvideo.mp4', 'oldVersion', 'newVersion');

        const listCalls = mockS3Client.commandCalls(ListObjectsV2Command);
        expect(listCalls.length).toBe(1);
        expect(listCalls[0].args[0].input.Prefix).toBe('i/2001/12-31/video.mp4/oldVersion/');

        const copyCalls = mockS3Client.commandCalls(CopyObjectCommand);
        expect(copyCalls.length).toBe(2);

        const copyDestinations = copyCalls.map((call) => call.args[0].input.Key);
        expect(copyDestinations).toContain('i/2001/12-31/newvideo.mp4/newVersion/video-transcoded');
        expect(copyDestinations).toContain('i/2001/12-31/newvideo.mp4/newVersion/video-poster');
    });

    test('handles image thumbnails', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({
            Contents: [
                { Key: 'i/2001/12-31/image.jpg/oldVersion/200' },
                { Key: 'i/2001/12-31/image.jpg/oldVersion/400' },
                { Key: 'i/2001/12-31/image.jpg/oldVersion/webp/200' },
            ],
        });
        mockS3Client.on(CopyObjectCommand).resolves({});

        await copyDerivedAssets('/2001/12-31/image.jpg', '/2001/12-31/newimage.jpg', 'oldVersion', 'newVersion');

        const copyCalls = mockS3Client.commandCalls(CopyObjectCommand);
        expect(copyCalls.length).toBe(3);

        const copyDestinations = copyCalls.map((call) => call.args[0].input.Key);
        expect(copyDestinations).toContain('i/2001/12-31/newimage.jpg/newVersion/200');
        expect(copyDestinations).toContain('i/2001/12-31/newimage.jpg/newVersion/400');
        expect(copyDestinations).toContain('i/2001/12-31/newimage.jpg/newVersion/webp/200');
    });

    test('handles no derived assets gracefully', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({
            Contents: [],
        });

        // Should not throw
        await copyDerivedAssets('/2001/12-31/image.jpg', '/2001/12-31/newimage.jpg', 'oldVersion', 'newVersion');

        // Should not have called CopyObjectCommand
        const copyCalls = mockS3Client.commandCalls(CopyObjectCommand);
        expect(copyCalls.length).toBe(0);
    });

    test('handles undefined Contents gracefully', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({});

        // Should not throw
        await copyDerivedAssets('/2001/12-31/image.jpg', '/2001/12-31/newimage.jpg', 'oldVersion', 'newVersion');

        const copyCalls = mockS3Client.commandCalls(CopyObjectCommand);
        expect(copyCalls.length).toBe(0);
    });

    test('skips objects without Key', async () => {
        mockS3Client.on(ListObjectsV2Command).resolves({
            Contents: [{ Key: 'i/2001/12-31/image.jpg/oldVersion/200' }, { Key: undefined }, {}],
        });
        mockS3Client.on(CopyObjectCommand).resolves({});

        await copyDerivedAssets('/2001/12-31/image.jpg', '/2001/12-31/newimage.jpg', 'oldVersion', 'newVersion');

        // Only one copy should be made (the one with a valid Key)
        const copyCalls = mockS3Client.commandCalls(CopyObjectCommand);
        expect(copyCalls.length).toBe(1);
    });
});
