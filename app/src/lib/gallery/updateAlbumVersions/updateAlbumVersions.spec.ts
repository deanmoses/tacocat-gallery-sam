import { mockClient } from 'aws-sdk-client-mock';
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBStreamEvent } from 'aws-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';
import { batchFromStream, computeAlbumVersionUpdates, StreamBatch } from './updateAlbumVersions';
import { AlbumItem, GalleryItem, ImageItem } from '../galleryTypes';

const mockDocClient = mockClient(DynamoDBDocumentClient);
const table = process.env.GALLERY_ITEM_DDB_TABLE!;

const year: AlbumItem = {
    parentPath: '/',
    itemName: '2001',
    itemType: 'album',
    published: true,
    thumbnail: { path: '/2001/12-31/a.jpg', versionId: 'stale' },
};
const day: AlbumItem = {
    parentPath: '/2001/',
    itemName: '12-31',
    itemType: 'album',
    published: true,
    description: 'New Year',
    thumbnail: { path: '/2001/12-31/a.jpg', versionId: 'stale' },
};
const imageA: ImageItem = {
    parentPath: '/2001/12-31/',
    itemName: 'a.jpg',
    itemType: 'image',
    versionId: 'v1',
    dimensions: { width: 4, height: 3 },
};
const imageB: ImageItem = { ...imageA, itemName: 'b.jpg' };

/** A batch that touched these paths, carrying these rows as the writes left them */
function batch(paths: string[], items: Record<string, GalleryItem> = {}, removed: string[] = []): StreamBatch {
    return { paths, items: new Map(Object.entries(items)), removed: new Set(removed) };
}

/** A gallery of one year with one day album holding two images */
function mockGallery(options: { dayExists?: boolean } = {}) {
    mockDocClient.on(GetCommand, { Key: { parentPath: '/', itemName: '2001' } }).resolves({ Item: year });
    mockDocClient
        .on(GetCommand, { Key: { parentPath: '/2001/', itemName: '12-31' } })
        .resolves(options.dayExists === false ? {} : { Item: day });
    mockDocClient.on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } }).resolves({ Items: [year] });
    mockDocClient
        .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
        .resolves({ Items: options.dayExists === false ? [] : [day] });
    mockDocClient
        .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/12-31/' } })
        .resolves({ Items: [imageA, imageB] });
    mockDocClient.on(BatchGetCommand).resolves({
        Responses: { [table]: [{ parentPath: '/2001/12-31/', itemName: 'a.jpg', versionId: 'v1' }] },
    });
}

afterEach(() => {
    mockDocClient.reset();
});

describe('batchFromStream', () => {
    test('rebuilds album and media paths from record keys and dedupes', () => {
        const event = {
            Records: [
                record('/2001/12-31/', 'a.jpg', 'INSERT'),
                record('/2001/12-31/', 'a.jpg', 'MODIFY'),
                record('/2001/', '12-31', 'REMOVE'),
                record('/', '2001', 'MODIFY'),
            ],
        } as unknown as DynamoDBStreamEvent;
        expect(batchFromStream(event).paths).toEqual(['/2001/12-31/a.jpg', '/2001/12-31/', '/2001/']);
    });

    test('carries each row as its last record left it, and the removed ones by path', () => {
        const edited = { ...imageA, title: 'Edited' };
        const event = {
            Records: [
                record('/2001/12-31/', 'a.jpg', 'INSERT', imageA),
                record('/2001/12-31/', 'a.jpg', 'MODIFY', edited),
                record('/2001/12-31/', 'b.jpg', 'REMOVE'),
                record('/', '2001', 'MODIFY', year),
            ],
        } as unknown as DynamoDBStreamEvent;
        const { items, removed } = batchFromStream(event);
        expect(items.get('/2001/12-31/a.jpg')).toEqual(edited);
        expect(items.get('/2001/')).toEqual(year);
        expect([...removed]).toEqual(['/2001/12-31/b.jpg']);
    });
});

describe('computeAlbumVersionUpdates', () => {
    test('a media item that is nobody’s thumbnail only changes its day album', async () => {
        mockGallery();
        const updates = await computeAlbumVersionUpdates(batch(['/2001/12-31/b.jpg']));
        expect([...updates.puts.keys()]).toEqual(['content:/2001/12-31/']);
        expect(updates.deletes.size).toBe(0);
    });

    test('a media item that is the day and year thumbnail changes day, year and root', async () => {
        mockGallery();
        const updates = await computeAlbumVersionUpdates(batch(['/2001/12-31/a.jpg']));
        expect([...updates.puts.keys()].sort()).toEqual(['content:/', 'content:/2001/', 'content:/2001/12-31/']);
    });

    // The year lists the day album with the day's thumbnail, so the year moves with it
    test('a media item that is only its day’s thumbnail changes day and year', async () => {
        mockGallery();
        mockDocClient.on(GetCommand, { Key: { parentPath: '/', itemName: '2001' } }).resolves({
            Item: { ...year, thumbnail: { path: '/2001/12-31/b.jpg', versionId: 'stale' } },
        });
        const updates = await computeAlbumVersionUpdates(batch(['/2001/12-31/a.jpg']));
        expect([...updates.puts.keys()].sort()).toEqual(['content:/2001/', 'content:/2001/12-31/']);
    });

    // A year's thumbnail is any image in the year, not necessarily its day's
    test('a media item that is only the year’s thumbnail changes day, year and root', async () => {
        mockGallery();
        mockDocClient.on(GetCommand, { Key: { parentPath: '/2001/', itemName: '12-31' } }).resolves({
            Item: { ...day, thumbnail: { path: '/2001/12-31/b.jpg', versionId: 'stale' } },
        });
        const updates = await computeAlbumVersionUpdates(batch(['/2001/12-31/a.jpg']));
        expect([...updates.puts.keys()].sort()).toEqual(['content:/', 'content:/2001/', 'content:/2001/12-31/']);
    });

    /**
     * The stream fires within milliseconds of the write it reports, and a read
     * that has not caught up would hash the state before it. The batch's own
     * rows win over the table's, which is what lets every read stay eventually
     * consistent, at half the cost of a consistent one.
     */
    describe('the batch’s own rows win over what the table returns', () => {
        const dayVersion = (updates: Awaited<ReturnType<typeof computeAlbumVersionUpdates>>) =>
            updates.puts.get('content:/2001/12-31/');

        test('a changed album hashes as the write left it, and is not read at all', async () => {
            mockGallery();
            const edited = { ...day, description: 'Edited' };
            const fromBatch = await computeAlbumVersionUpdates(batch(['/2001/12-31/'], { '/2001/12-31/': edited }));
            const dayAlbumGets = mockDocClient
                .commandCalls(GetCommand)
                .filter((call) => call.args[0].input.Key?.itemName === '12-31');
            expect(dayAlbumGets).toHaveLength(0);

            mockDocClient
                .on(GetCommand, { Key: { parentPath: '/2001/', itemName: '12-31' } })
                .resolves({ Item: edited });
            const fromTable = await computeAlbumVersionUpdates(batch(['/2001/12-31/']));
            expect(dayVersion(fromBatch)).toBe(dayVersion(fromTable));
        });

        test('a changed child replaces the table’s copy, a new one is added, a removed one dropped', async () => {
            mockGallery();
            const imageC: ImageItem = { ...imageA, itemName: 'c.jpg' };
            const editedA = { ...imageA, title: 'Edited' };
            const fromBatch = await computeAlbumVersionUpdates(
                batch(
                    ['/2001/12-31/a.jpg', '/2001/12-31/b.jpg', '/2001/12-31/c.jpg'],
                    { '/2001/12-31/a.jpg': editedA, '/2001/12-31/c.jpg': imageC },
                    ['/2001/12-31/b.jpg'],
                ),
            );

            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/12-31/' } })
                .resolves({ Items: [editedA, imageC] });
            const fromTable = await computeAlbumVersionUpdates(batch(['/2001/12-31/a.jpg']));
            expect(dayVersion(fromBatch)).toBe(dayVersion(fromTable));
        });

        test('a changed thumbnail image reaches the albums that show it', async () => {
            mockGallery();
            const recut = { ...imageA, versionId: 'v2' };
            const fromBatch = await computeAlbumVersionUpdates(
                batch(['/2001/12-31/a.jpg'], { '/2001/12-31/a.jpg': recut }),
            );

            mockDocClient.on(BatchGetCommand).resolves({
                Responses: { [table]: [{ parentPath: '/2001/12-31/', itemName: 'a.jpg', versionId: 'v2' }] },
            });
            mockDocClient
                .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/12-31/' } })
                .resolves({ Items: [recut, imageB] });
            const fromTable = await computeAlbumVersionUpdates(batch(['/2001/12-31/a.jpg']));
            expect(fromBatch.puts.get('content:/2001/')).toBe(fromTable.puts.get('content:/2001/'));
            expect(fromBatch.puts.get('content:/')).toBe(fromTable.puts.get('content:/'));
        });

        test('a year in the batch is never read: not for its content, not for its thumbnail', async () => {
            mockGallery();
            const updates = await computeAlbumVersionUpdates(
                batch(['/2001/12-31/a.jpg', '/2001/'], { '/2001/': year }),
            );
            expect([...updates.puts.keys()].sort()).toEqual(['content:/', 'content:/2001/', 'content:/2001/12-31/']);
            const yearGets = mockDocClient
                .commandCalls(GetCommand)
                .filter((call) => call.args[0].input.Key?.itemName === '2001');
            expect(yearGets).toHaveLength(0);
        });

        test('every read is eventually consistent', async () => {
            mockGallery();
            await computeAlbumVersionUpdates(batch(['/2001/12-31/a.jpg', '/2001/12-31/']));
            const reads = [...mockDocClient.commandCalls(GetCommand), ...mockDocClient.commandCalls(QueryCommand)];
            expect(reads.length).toBeGreaterThan(0);
            expect(reads.some((call) => call.args[0].input.ConsistentRead)).toBe(false);
        });
    });

    // Siblings are left alone: nothing in an album's response depends on them
    test('a day album changes itself and its year', async () => {
        mockGallery();
        const updates = await computeAlbumVersionUpdates(batch(['/2001/12-31/']));
        expect([...updates.puts.keys()].sort()).toEqual(['content:/2001/', 'content:/2001/12-31/']);
    });

    test('a year album changes itself and the root', async () => {
        mockGallery();
        const updates = await computeAlbumVersionUpdates(batch(['/2001/']));
        expect([...updates.puts.keys()].sort()).toEqual(['content:/', 'content:/2001/']);
    });

    test('a deleted album loses its key and its parent is recomputed', async () => {
        mockGallery({ dayExists: false });
        const updates = await computeAlbumVersionUpdates(batch(['/2001/12-31/']));
        expect([...updates.puts.keys()]).toEqual(['content:/2001/']);
        expect([...updates.deletes]).toEqual(['content:/2001/12-31/']);
    });

    test('a batch fetches each album once', async () => {
        mockGallery();
        await computeAlbumVersionUpdates(batch(['/2001/12-31/a.jpg', '/2001/12-31/b.jpg', '/2001/12-31/']));
        const dayAlbumGets = mockDocClient
            .commandCalls(GetCommand)
            .filter((call) => call.args[0].input.Key?.itemName === '12-31');
        expect(dayAlbumGets).toHaveLength(1);
    });

    test('versions are stable across runs and change with content', async () => {
        mockGallery();
        const before = await computeAlbumVersionUpdates(batch(['/2001/12-31/']));
        const again = await computeAlbumVersionUpdates(batch(['/2001/12-31/']));
        expect(again.puts).toEqual(before.puts);

        const edited = { ...day, description: 'Edited' };
        mockDocClient.on(GetCommand, { Key: { parentPath: '/2001/', itemName: '12-31' } }).resolves({ Item: edited });
        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
            .resolves({ Items: [edited] });
        const after = await computeAlbumVersionUpdates(batch(['/2001/12-31/']));
        expect(after.puts.get('content:/2001/12-31/')).not.toBe(before.puts.get('content:/2001/12-31/'));
        // The year's child list carries the description, so its version moves too
        expect(after.puts.get('content:/2001/')).not.toBe(before.puts.get('content:/2001/'));
    });
});

function record(parentPath: string, itemName: string, eventName: string, newImage?: GalleryItem) {
    return {
        eventName,
        dynamodb: {
            Keys: { parentPath: { S: parentPath }, itemName: { S: itemName } },
            NewImage: newImage && marshall(newImage, { removeUndefinedValues: true }),
        },
    };
}
