import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException, ExecuteStatementCommand } from '@aws-sdk/client-dynamodb';
import {
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
    S3Client,
} from '@aws-sdk/client-s3';
import type { ImageItem } from '../galleryTypes';
import { renameMedia } from './renameMedia';

const mockS3Client = mockClient(S3Client);
const mockDDBClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDDBClient.reset();
    mockS3Client.reset();
});

describe('Invalid Existing Image Paths', () => {
    const paths = [
        '',
        '/',
        'adf',
        '2000',
        '/2000',
        '2000/',
        '/2000/',
        '2000/12-31',
        '/2000/12-31/', // album, not image
        '2000/12-31/image.jpg', // no starting /
        '/2000/12-31/image', // no extension
    ];
    paths.forEach((path) => {
        it(`Invalid: [${path}]`, async () => {
            await expect(renameMedia(path, 'image.jpg')).rejects.toThrow(/invalid|malformed/i);
            expect(mockDDBClient.calls()).toHaveLength(0);
            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });
});

describe('Invalid New Image Names', () => {
    const imageNames = [
        '',
        '/',
        '.',
        'newName',
        '2000',
        '/2000',
        '2000/',
        '/2000/',
        '2000/12-31',
        '/2000/12-31/',
        '2000/12-31/image.jpg',
        '/2000/12-31/image.jpg',
        '/2000/12-31/image',
        '/newName.jpg',
        '/newName.gif',
        '.jpg',
        ' .jpg',
        'a b.jpg',
        'a-b.jpg',
        'a.b.jpg',
        'a%b.jpg',
        'a^b.jpg',
        'a b.jpg',
        '_.jpg',
        '__.jpg',
        '_image.jpg', // _ at beginning
        'image_.jpg', // _ at end
        'IMAGE.JPG', // capitals
        'image.JPG', // capitals
        'IMAGE.jpg', // capitals
    ];
    imageNames.forEach((imageName) => {
        it(`Invalid: [${imageName}]`, async () => {
            await expect(renameMedia('/2001/12-31/image.jpg', imageName)).rejects.toThrow(/invalid|malformed/i);
            expect(mockDDBClient.calls()).toHaveLength(0);
            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });
});

describe("Extensions don't match", () => {
    const imageNamePairs = [
        { oldName: 'name.png', newName: 'new_name.jpg' },
        { oldName: 'name.jpg', newName: 'new_name.png' },
        { oldName: 'name.jpg', newName: 'new_name.gif' },
    ];
    imageNamePairs.forEach((pair) => {
        const oldName = pair.oldName;
        const newName = pair.newName;

        it(`Mismatch: [${oldName}] [${newName}]`, async () => {
            await expect(renameMedia(`/2001/12-31/${oldName}`, newName)).rejects.toThrow(/match/i);
            expect(mockDDBClient.calls()).toHaveLength(0);
            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });
});

describe('Extension comparison is case-insensitive', () => {
    // Files can be uploaded with uppercase extensions (e.g., photo.JPG from cameras)
    // but new names must be lowercase per isValidMediaNameStrict.
    // Extension comparison should still allow renaming .JPG to .jpg
    it('Allows renaming .JPG to .jpg', async () => {
        // Passes validation, fails on "not found" - proving extension check passed
        await expect(renameMedia('/2001/12-31/photo.JPG', 'newphoto.jpg')).rejects.toThrow(/not found/i);
        expect(mockDDBClient.calls().length).toBeGreaterThan(0);
    });

    it('Allows renaming .MP4 to .mp4', async () => {
        await expect(renameMedia('/2001/12-31/video.MP4', 'newvideo.mp4')).rejects.toThrow(/not found/i);
        expect(mockDDBClient.calls().length).toBeGreaterThan(0);
    });
});

test('Fail if old and new are same name', async () => {
    await expect(renameMedia('/2001/12-31/image.jpg', 'image.jpg')).rejects.toThrow(/same/i);
});

// Video rename tests
describe('Video rename validation', () => {
    describe('Invalid existing video paths', () => {
        const invalidPaths = [
            '/2000/12-31/video', // no extension
            '2000/12-31/video.mp4', // no starting /
            '/2000/12-31/', // album, not video
        ];
        invalidPaths.forEach((path) => {
            it(`Invalid: [${path}]`, async () => {
                await expect(renameMedia(path, 'newvideo.mp4')).rejects.toThrow(/invalid|malformed/i);
                expect(mockDDBClient.calls()).toHaveLength(0);
                expect(mockS3Client.calls()).toHaveLength(0);
            });
        });
    });

    describe('Invalid new video names', () => {
        const invalidNames = [
            '',
            'video', // no extension
            '/newvideo.mp4', // has path
            'VIDEO.MP4', // capitals
            'video.MP4', // capitals
            'new-video.mp4', // hyphen
            '_video.mp4', // underscore at start
            'video_.mp4', // underscore at end
        ];
        invalidNames.forEach((name) => {
            it(`Invalid: [${name}]`, async () => {
                await expect(renameMedia('/2001/12-31/video.mp4', name)).rejects.toThrow(/invalid|malformed/i);
                expect(mockDDBClient.calls()).toHaveLength(0);
                expect(mockS3Client.calls()).toHaveLength(0);
            });
        });
    });

    describe('Video extensions must match', () => {
        const mismatchedPairs = [
            { oldName: 'video.mp4', newName: 'newvideo.mov' },
            { oldName: 'video.mov', newName: 'newvideo.mp4' },
            { oldName: 'video.mp4', newName: 'newvideo.jpg' }, // video to image
        ];
        mismatchedPairs.forEach((pair) => {
            it(`Mismatch: [${pair.oldName}] -> [${pair.newName}]`, async () => {
                await expect(renameMedia(`/2001/12-31/${pair.oldName}`, pair.newName)).rejects.toThrow(/match/i);
                expect(mockDDBClient.calls()).toHaveLength(0);
                expect(mockS3Client.calls()).toHaveLength(0);
            });
        });
    });

    it('Fail if video old and new are same name', async () => {
        await expect(renameMedia('/2001/12-31/video.mp4', 'video.mp4')).rejects.toThrow(/same/i);
    });

    describe('Valid video paths accepted', () => {
        const validExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp', 'mpg', 'mpeg'];
        validExtensions.forEach((ext) => {
            it(`Valid video extension: .${ext}`, async () => {
                // Path/name validation passes, but fails on "media not found" because
                // the mock DDB returns empty. This proves validation didn't reject it.
                await expect(renameMedia(`/2001/12-31/video.${ext}`, `newvideo.${ext}`)).rejects.toThrow(/not found/i);
                // DDB was queried, meaning we got past path validation
                expect(mockDDBClient.calls().length).toBeGreaterThan(0);
            });
        });
    });
});

describe('renaming an image', () => {
    const albumPath = '/2001/12-31/';
    const oldMediaPath = `${albumPath}image.jpg`;
    const newMediaPath = `${albumPath}renamed.jpg`;
    const oldKey = { parentPath: albumPath, itemName: 'image.jpg' };
    const newKey = { parentPath: albumPath, itemName: 'renamed.jpg' };
    const table = 'no-such-table';

    /** The album and the year album: the two places the image could be a thumbnail */
    function thumbnailStatements() {
        return mockDDBClient.commandCalls(ExecuteStatementCommand).map((call) => {
            const parameters = call.args[0].input.Parameters ?? [];
            return {
                newPath: parameters[0]?.S,
                parentPath: parameters[2]?.S,
                itemName: parameters[3]?.S,
                oldPath: parameters[4]?.S,
            };
        });
    }

    beforeEach(() => {
        // Fresh object every test: the rename mutates the item it reads
        const image: ImageItem = {
            ...oldKey,
            itemType: 'image',
            versionId: 'old',
            dimensions: { width: 4, height: 3 },
        };
        mockDDBClient.on(GetCommand, { Key: oldKey }).resolves({ Item: image });
        mockDDBClient.on(GetCommand, { Key: newKey }).resolves({});
        mockDDBClient.on(TransactWriteCommand).resolves({});
        mockDDBClient.on(ExecuteStatementCommand).resolves({});

        mockS3Client.on(CopyObjectCommand, { Key: '2001/12-31/renamed.jpg' }).resolves({ VersionId: 'new' });
        mockS3Client.on(CopyObjectCommand, { Key: 'i/2001/12-31/renamed.jpg/new/200' }).resolves({});
        mockS3Client.on(CopyObjectCommand, { Key: 'i/2001/12-31/renamed.jpg/new/webp/400' }).resolves({});
        // Strict matches: a partial match treats a string as a substring, and one prefix contains the other
        mockS3Client
            .on(ListObjectsV2Command, { Bucket: 'no-such-bucket', Prefix: 'i/2001/12-31/image.jpg/old/' }, true)
            .resolves({
                Contents: [{ Key: 'i/2001/12-31/image.jpg/old/200' }, { Key: 'i/2001/12-31/image.jpg/old/webp/400' }],
            });
        mockS3Client
            .on(ListObjectsV2Command, { Bucket: 'no-such-bucket', Prefix: 'i/2001/12-31/image.jpg' }, true)
            .resolves({
                KeyCount: 2,
                Contents: [{ Key: 'i/2001/12-31/image.jpg/old/200' }, { Key: 'i/2001/12-31/image.jpg/old/webp/400' }],
            });
        mockS3Client.on(DeleteObjectCommand).resolves({});
        mockS3Client.on(DeleteObjectsCommand).resolves({ Deleted: [] });
    });

    describe('when everything succeeds', () => {
        it('returns the new media path', async () => {
            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).resolves.toBe(newMediaPath);
        });

        it('copies the original, then its derived images under the new name and version', async () => {
            await renameMedia(oldMediaPath, 'renamed.jpg');

            const copies = mockS3Client.commandCalls(CopyObjectCommand).map((call) => call.args[0].input);

            expect(copies).toStrictEqual([
                {
                    CopySource: 'no-such-bucket/2001/12-31/image.jpg',
                    Bucket: 'no-such-bucket',
                    Key: '2001/12-31/renamed.jpg',
                },
                {
                    CopySource: 'no-such-bucket/i/2001/12-31/image.jpg/old/200',
                    Bucket: 'no-such-bucket',
                    Key: 'i/2001/12-31/renamed.jpg/new/200',
                },
                {
                    CopySource: 'no-such-bucket/i/2001/12-31/image.jpg/old/webp/400',
                    Bucket: 'no-such-bucket',
                    Key: 'i/2001/12-31/renamed.jpg/new/webp/400',
                },
            ]);
        });

        it('moves the item in one transaction, giving it the copied version ID', async () => {
            await renameMedia(oldMediaPath, 'renamed.jpg');

            const transactions = mockDDBClient.commandCalls(TransactWriteCommand);

            expect(transactions).toHaveLength(1);

            const [put, remove] = transactions[0].args[0].input.TransactItems ?? [];
            const { parentPath, itemName, versionId } = put.Put?.Item as ImageItem;

            expect(put.Put?.TableName).toBe(table);
            expect({ parentPath, itemName, versionId }).toStrictEqual({ ...newKey, versionId: 'new' });
            expect(remove).toStrictEqual({ Delete: { TableName: table, Key: oldKey } });
        });

        it('points the album and year album thumbnails at the new path, where they were the image', async () => {
            await renameMedia(oldMediaPath, 'renamed.jpg');

            expect(thumbnailStatements()).toStrictEqual([
                { newPath: newMediaPath, parentPath: '/2001/', itemName: '12-31', oldPath: oldMediaPath },
                { newPath: newMediaPath, parentPath: '/', itemName: '2001', oldPath: oldMediaPath },
            ]);
        });

        it('deletes the old original and its derived images only after the move', async () => {
            await renameMedia(oldMediaPath, 'renamed.jpg');

            expect(mockS3Client.commandCalls(DeleteObjectCommand)[0].args[0].input.Key).toBe('2001/12-31/image.jpg');
            expect(mockS3Client.commandCalls(DeleteObjectsCommand)[0].args[0].input.Delete?.Objects).toStrictEqual([
                { Key: 'i/2001/12-31/image.jpg/old/200' },
                { Key: 'i/2001/12-31/image.jpg/old/webp/400' },
            ]);

            const commandOrder = mockS3Client.calls().map((call) => call.args[0].constructor.name);

            expect(commandOrder.indexOf('DeleteObjectCommand')).toBeGreaterThan(
                commandOrder.lastIndexOf('CopyObjectCommand'),
            );
        });

        it('succeeds when the image was not an album thumbnail, which the thumbnail update reports as a failed condition', async () => {
            mockDDBClient
                .on(ExecuteStatementCommand)
                .rejects(
                    new ConditionalCheckFailedException({ $metadata: {}, message: 'The conditional request failed' }),
                );

            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).resolves.toBe(newMediaPath);

            expect(mockS3Client.commandCalls(DeleteObjectCommand)).toHaveLength(1);
        });

        it('copies nothing derived when there is nothing derived', async () => {
            mockS3Client
                .on(ListObjectsV2Command, { Bucket: 'no-such-bucket', Prefix: 'i/2001/12-31/image.jpg/old/' }, true)
                .resolves({});

            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).resolves.toBe(newMediaPath);

            expect(mockS3Client.commandCalls(CopyObjectCommand)).toHaveLength(1);
        });
    });

    describe('when the old image does not exist', () => {
        it('rejects without touching S3', async () => {
            mockDDBClient.on(GetCommand, { Key: oldKey }).resolves({});

            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).rejects.toThrow(/not found/i);

            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });

    describe('when an image already has the new name', () => {
        it('rejects without touching S3', async () => {
            mockDDBClient.on(GetCommand, { Key: newKey }).resolves({ Item: { ...newKey, itemType: 'image' } });

            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).rejects.toThrow(/already exists/i);

            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });

    describe('when the item has no version ID', () => {
        it('rejects without touching S3', async () => {
            mockDDBClient.on(GetCommand, { Key: oldKey }).resolves({ Item: { ...oldKey, itemType: 'image' } });

            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).rejects.toThrow(/versionId/);

            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });

    describe('when copying the original fails', () => {
        beforeEach(() => {
            mockS3Client.on(CopyObjectCommand, { Key: '2001/12-31/renamed.jpg' }).rejects(new Error('AccessDenied'));
        });

        it('rejects with the S3 error', async () => {
            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).rejects.toThrow('AccessDenied');
        });

        it('leaves the table and the old original untouched', async () => {
            await renameMedia(oldMediaPath, 'renamed.jpg').catch(() => undefined);

            expect(mockDDBClient.commandCalls(TransactWriteCommand)).toHaveLength(0);
            expect(mockDDBClient.commandCalls(ExecuteStatementCommand)).toHaveLength(0);
            expect(mockS3Client.commandCalls(DeleteObjectCommand)).toHaveLength(0);
            expect(mockS3Client.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
        });
    });

    describe('when S3 returns no version ID for the copy', () => {
        it('rejects before writing to the table', async () => {
            mockS3Client.on(CopyObjectCommand, { Key: '2001/12-31/renamed.jpg' }).resolves({});

            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).rejects.toThrow(/version ID/i);

            expect(mockDDBClient.commandCalls(TransactWriteCommand)).toHaveLength(0);
            expect(mockS3Client.commandCalls(DeleteObjectCommand)).toHaveLength(0);
        });
    });

    describe('when copying a derived image fails', () => {
        it('rejects before writing to the table', async () => {
            mockS3Client
                .on(CopyObjectCommand, { Key: 'i/2001/12-31/renamed.jpg/new/200' })
                .rejects(new Error('SlowDown'));

            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).rejects.toThrow('SlowDown');

            expect(mockDDBClient.commandCalls(TransactWriteCommand)).toHaveLength(0);
            expect(mockS3Client.commandCalls(DeleteObjectCommand)).toHaveLength(0);
        });
    });

    describe('when the transaction fails', () => {
        it('rejects and keeps the old original, so the rename can be retried', async () => {
            mockDDBClient.on(TransactWriteCommand).rejects(new Error('TransactionCanceledException'));

            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).rejects.toThrow('TransactionCanceledException');

            expect(mockS3Client.commandCalls(DeleteObjectCommand)).toHaveLength(0);
            expect(mockS3Client.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
        });
    });

    describe('when a thumbnail update fails for a reason other than a failed condition', () => {
        it('rejects and keeps the old original', async () => {
            mockDDBClient.on(ExecuteStatementCommand).rejects(new Error('ProvisionedThroughputExceededException'));

            await expect(renameMedia(oldMediaPath, 'renamed.jpg')).rejects.toThrow(
                'ProvisionedThroughputExceededException',
            );

            expect(mockS3Client.commandCalls(DeleteObjectCommand)).toHaveLength(0);
        });
    });
});
