import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ExecuteStatementCommand } from '@aws-sdk/client-dynamodb';
import { CopyObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { AlbumItem, ImageItem } from '../galleryTypes';
import { renameAlbum } from './renameAlbum';

/** The fields of a written item that a rename changes */
type WrittenItem = { parentPath?: string; itemName?: string; versionId?: string; thumbnail?: { path: string } };

const mockS3Client = mockClient(S3Client);
const mockDDBClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDDBClient.reset();
    mockS3Client.reset();
});

describe('Invalid existing album paths', () => {
    const paths = [
        '',
        'adf',
        '2000',
        '/2000',
        '2000/',
        '2000/12-31', // missing slashes
        '2000/12-31/', // missing slashes
        '/2000/12_31/', // underscore
        ' /2000/12-31/', // leading space
        ' /2000/12-31/ ', // trailing space
        '2000/12-31/image.jpg',
        '/2000/12-31/image',
        '/2000/12-31/image.jpg', // image, not album
    ];
    paths.forEach((path) => {
        it(`Invalid: [${path}]`, async () => {
            await expect(renameAlbum(path, '01-01')).rejects.toThrow(/invalid|malformed/i);
            expect(mockDDBClient.calls()).toHaveLength(0);
            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });
});

describe('Invalid new name', () => {
    const newDayAlbumNames = [
        '',
        'adf',
        '2000',
        '/2000',
        '2000/',
        '2000/12-31', // missing slashes
        '2000/12-31/', // missing slashes
        '/2000/12_31/', // underscore
        ' /2000/12-31/', // leading space
        ' /2000/12-31/ ', // trailing space
        '2000/12-31/image.jpg',
        '/2000/12-31/image',
        '/2000/12-31/image.jpg', // image, not album
    ];
    newDayAlbumNames.forEach((newDayAlbumName) => {
        it(`Invalid: [${newDayAlbumName}]`, async () => {
            await expect(renameAlbum('/2001/12-31/', newDayAlbumName)).rejects.toThrow(/invalid|malformed/i);
            expect(mockDDBClient.calls()).toHaveLength(0);
            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });
});

test('Cannot rename root album', async () => {
    await expect(renameAlbum('/', '01-01')).rejects.toThrow(/root/i);
});

describe('Cannot rename year albums', () => {
    const paths = ['/2001/', '/2020/'];
    paths.forEach((path) => {
        it(`Invalid: [${path}]`, async () => {
            await expect(renameAlbum(path, '01-01')).rejects.toThrow(/year/i);
            expect(mockDDBClient.calls()).toHaveLength(0);
            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });
});

test('Cannot rename to same name', async () => {
    await expect(renameAlbum('/2001/01-01/', '01-01')).rejects.toThrow(/same/i);
});

describe('renaming an album', () => {
    const oldAlbumPath = '/2001/12-31/';
    const newAlbumPath = '/2001/12-29/';
    const oldKey = { parentPath: '/2001/', itemName: '12-31' };
    const newKey = { parentPath: '/2001/', itemName: '12-29' };
    const yearKey = { parentPath: '/', itemName: '2001' };
    const table = 'no-such-table';

    function image(name: string, versionId: string): ImageItem {
        return {
            parentPath: oldAlbumPath,
            itemName: name,
            itemType: 'image',
            versionId,
            dimensions: { width: 4, height: 3 },
        };
    }

    beforeEach(() => {
        // Fresh objects every test: the rename mutates the items it reads
        const album: AlbumItem = {
            ...oldKey,
            itemType: 'album',
            published: true,
            thumbnail: { path: `${oldAlbumPath}image1.jpg`, versionId: 'old1' },
        };
        mockDDBClient.on(GetCommand, { Key: oldKey }).resolves({ Item: album });
        mockDDBClient.on(GetCommand, { Key: newKey }).resolves({});
        mockDDBClient
            .on(GetCommand, { Key: yearKey })
            .resolves({ Item: { thumbnail: { path: `${oldAlbumPath}image2.jpg`, versionId: 'old2' } } });
        mockDDBClient.on(QueryCommand).resolves({ Items: [image('image1.jpg', 'old1'), image('image2.jpg', 'old2')] });
        mockDDBClient.on(TransactWriteCommand).resolves({});
        mockDDBClient.on(ExecuteStatementCommand).resolves({});

        // Strict matches: a partial match treats a string as a substring, and one prefix contains the other
        mockS3Client
            .on(ListObjectsV2Command, { Bucket: 'no-such-bucket', Prefix: '2001/12-31/' }, true)
            .resolves({ KeyCount: 2, Contents: [{ Key: '2001/12-31/image1.jpg' }, { Key: '2001/12-31/image2.jpg' }] });
        mockS3Client
            .on(ListObjectsV2Command, { Bucket: 'no-such-bucket', Prefix: 'i/2001/12-31/' }, true)
            .resolves({ KeyCount: 1, Contents: [{ Key: 'i/2001/12-31/image1.jpg/old1/200' }] });
        mockS3Client.on(CopyObjectCommand, { Key: '2001/12-29/image1.jpg' }).resolves({ VersionId: 'new1' });
        mockS3Client.on(CopyObjectCommand, { Key: '2001/12-29/image2.jpg' }).resolves({ VersionId: 'new2' });
        mockS3Client.on(DeleteObjectsCommand).resolves({ Deleted: [] });
    });

    describe('when everything succeeds', () => {
        it('returns the new album path', async () => {
            await expect(renameAlbum(oldAlbumPath, '12-29')).resolves.toBe(newAlbumPath);
        });

        it('copies each original into the new album', async () => {
            await renameAlbum(oldAlbumPath, '12-29');

            const copies = mockS3Client.commandCalls(CopyObjectCommand).map((call) => call.args[0].input);

            expect(copies).toStrictEqual([
                {
                    CopySource: 'no-such-bucket/2001/12-31/image1.jpg',
                    Bucket: 'no-such-bucket',
                    Key: '2001/12-29/image1.jpg',
                },
                {
                    CopySource: 'no-such-bucket/2001/12-31/image2.jpg',
                    Bucket: 'no-such-bucket',
                    Key: '2001/12-29/image2.jpg',
                },
            ]);
        });

        it('moves the album and its children in one transaction, giving each image its copied version ID', async () => {
            await renameAlbum(oldAlbumPath, '12-29');

            const transactions = mockDDBClient.commandCalls(TransactWriteCommand);

            expect(transactions).toHaveLength(1);

            const items = transactions[0].args[0].input.TransactItems ?? [];
            const puts = items.flatMap((item) => (item.Put ? [item.Put.Item as WrittenItem] : []));
            const deletes = items.flatMap((item) => (item.Delete ? [item.Delete.Key] : []));

            expect(items.map((item) => (item.Put ?? item.Delete)?.TableName)).toStrictEqual(
                Array<string>(6).fill(table),
            );
            expect(
                puts.map(({ parentPath, itemName, versionId }) => ({ parentPath, itemName, versionId })),
            ).toStrictEqual([
                { ...newKey, versionId: undefined },
                { parentPath: newAlbumPath, itemName: 'image1.jpg', versionId: 'new1' },
                { parentPath: newAlbumPath, itemName: 'image2.jpg', versionId: 'new2' },
            ]);
            expect(puts[0].thumbnail?.path).toBe(`${newAlbumPath}image1.jpg`);
            expect(deletes).toStrictEqual([
                oldKey,
                { parentPath: oldAlbumPath, itemName: 'image1.jpg' },
                { parentPath: oldAlbumPath, itemName: 'image2.jpg' },
            ]);
        });

        it('points the year album thumbnail at the image in its new album', async () => {
            await renameAlbum(oldAlbumPath, '12-29');

            const statements = mockDDBClient.commandCalls(ExecuteStatementCommand);

            expect(statements).toHaveLength(1);
            expect(statements[0].args[0].input.Statement).toContain(`SET thumbnail.path='${newAlbumPath}image2.jpg'`);
            expect(statements[0].args[0].input.Statement).toContain(`WHERE parentPath='/' AND itemName='2001'`);
        });

        it('deletes the old originals and derived images only after the move', async () => {
            await renameAlbum(oldAlbumPath, '12-29');

            const deletes = mockS3Client
                .commandCalls(DeleteObjectsCommand)
                .map((call) => call.args[0].input.Delete?.Objects);

            expect(deletes).toStrictEqual([
                [{ Key: '2001/12-31/image1.jpg' }, { Key: '2001/12-31/image2.jpg' }],
                [{ Key: 'i/2001/12-31/image1.jpg/old1/200' }],
            ]);

            const commandOrder = mockS3Client.calls().map((call) => call.args[0].constructor.name);

            expect(commandOrder.indexOf('DeleteObjectsCommand')).toBeGreaterThan(
                commandOrder.lastIndexOf('CopyObjectCommand'),
            );
        });

        it('leaves a year album thumbnail alone when it is in another album', async () => {
            mockDDBClient
                .on(GetCommand, { Key: yearKey })
                .resolves({ Item: { thumbnail: { path: '/2001/01-01/other.jpg', versionId: 'x' } } });

            await renameAlbum(oldAlbumPath, '12-29');

            expect(mockDDBClient.commandCalls(ExecuteStatementCommand)).toHaveLength(0);
        });

        it('moves an empty album without copying anything', async () => {
            mockDDBClient.on(QueryCommand).resolves({ Items: [] });
            mockS3Client
                .on(ListObjectsV2Command, { Bucket: 'no-such-bucket', Prefix: '2001/12-31/' }, true)
                .resolves({ KeyCount: 0 });

            await expect(renameAlbum(oldAlbumPath, '12-29')).resolves.toBe(newAlbumPath);

            expect(mockS3Client.commandCalls(CopyObjectCommand)).toHaveLength(0);
            expect(mockDDBClient.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems).toHaveLength(2);
        });
    });

    describe('when the old album does not exist', () => {
        it('rejects without touching S3', async () => {
            mockDDBClient.on(GetCommand, { Key: oldKey }).resolves({});

            await expect(renameAlbum(oldAlbumPath, '12-29')).rejects.toThrow(/not found/i);

            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });

    describe('when an album already exists at the new path', () => {
        it('rejects without touching S3', async () => {
            mockDDBClient.on(GetCommand, { Key: newKey }).resolves({ Item: { ...newKey, itemType: 'album' } });

            await expect(renameAlbum(oldAlbumPath, '12-29')).rejects.toThrow(/already exists/i);

            expect(mockS3Client.calls()).toHaveLength(0);
        });
    });

    describe('when copying an original fails', () => {
        beforeEach(() => {
            mockS3Client.on(CopyObjectCommand, { Key: '2001/12-29/image2.jpg' }).rejects(new Error('AccessDenied'));
        });

        it('rejects with the S3 error', async () => {
            await expect(renameAlbum(oldAlbumPath, '12-29')).rejects.toThrow('AccessDenied');
        });

        it('leaves the table and the old originals untouched', async () => {
            await renameAlbum(oldAlbumPath, '12-29').catch(() => undefined);

            expect(mockDDBClient.commandCalls(TransactWriteCommand)).toHaveLength(0);
            expect(mockDDBClient.commandCalls(ExecuteStatementCommand)).toHaveLength(0);
            expect(mockS3Client.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
        });
    });

    describe('when S3 returns no version ID for a copy', () => {
        it('rejects before writing to the table', async () => {
            mockS3Client.on(CopyObjectCommand, { Key: '2001/12-29/image2.jpg' }).resolves({});

            await expect(renameAlbum(oldAlbumPath, '12-29')).rejects.toThrow(/version ID/i);

            expect(mockDDBClient.commandCalls(TransactWriteCommand)).toHaveLength(0);
            expect(mockS3Client.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
        });
    });

    describe('when the table lists a child S3 has no original for', () => {
        it('rejects naming the child, without moving anything', async () => {
            mockS3Client
                .on(ListObjectsV2Command, { Bucket: 'no-such-bucket', Prefix: '2001/12-31/' }, true)
                .resolves({ KeyCount: 1, Contents: [{ Key: '2001/12-31/image1.jpg' }] });

            await expect(renameAlbum(oldAlbumPath, '12-29')).rejects.toThrow(`${newAlbumPath}image2.jpg`);

            expect(mockDDBClient.commandCalls(TransactWriteCommand)).toHaveLength(0);
            expect(mockS3Client.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
        });
    });

    describe('when the transaction fails', () => {
        it('rejects and keeps the old originals, so the rename can be retried', async () => {
            mockDDBClient.on(TransactWriteCommand).rejects(new Error('TransactionCanceledException'));

            await expect(renameAlbum(oldAlbumPath, '12-29')).rejects.toThrow('TransactionCanceledException');

            expect(mockDDBClient.commandCalls(ExecuteStatementCommand)).toHaveLength(0);
            expect(mockS3Client.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
        });
    });

    describe('when rewriting the year album thumbnail fails', () => {
        it('rejects and keeps the old originals', async () => {
            mockDDBClient.on(ExecuteStatementCommand).rejects(new Error('ProvisionedThroughputExceededException'));

            await expect(renameAlbum(oldAlbumPath, '12-29')).rejects.toThrow('ProvisionedThroughputExceededException');

            expect(mockS3Client.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
        });
    });
});
