import { mockClient } from 'aws-sdk-client-mock';
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBStreamEvent } from 'aws-lambda';
import { changedPathsFromStream, computeAlbumVersionUpdates } from './updateAlbumVersions';
import { AlbumItem, ImageItem } from '../galleryTypes';

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

describe('changedPathsFromStream', () => {
    test('rebuilds album and media paths from record keys and dedupes', () => {
        const event = {
            Records: [
                record('/2001/12-31/', 'a.jpg', 'INSERT'),
                record('/2001/12-31/', 'a.jpg', 'MODIFY'),
                record('/2001/', '12-31', 'REMOVE'),
                record('/', '2001', 'MODIFY'),
            ],
        } as unknown as DynamoDBStreamEvent;
        expect(changedPathsFromStream(event)).toEqual(['/2001/12-31/a.jpg', '/2001/12-31/', '/2001/']);
    });
});

describe('computeAlbumVersionUpdates', () => {
    test('a media item that is nobody’s thumbnail only changes its day album', async () => {
        mockGallery();
        const updates = await computeAlbumVersionUpdates(['/2001/12-31/b.jpg']);
        expect([...updates.puts.keys()]).toEqual(['content:/2001/12-31/']);
        expect(updates.deletes.size).toBe(0);
    });

    test('a media item that is the day and year thumbnail changes day, year and root', async () => {
        mockGallery();
        const updates = await computeAlbumVersionUpdates(['/2001/12-31/a.jpg']);
        expect([...updates.puts.keys()].sort()).toEqual(['content:/', 'content:/2001/', 'content:/2001/12-31/']);
    });

    test('a day album changes itself, its year, and the year’s nav', async () => {
        mockGallery();
        const updates = await computeAlbumVersionUpdates(['/2001/12-31/']);
        expect([...updates.puts.keys()].sort()).toEqual(['content:/2001/', 'content:/2001/12-31/', 'nav:/2001/']);
    });

    test('a year album changes itself, the root, and the root’s nav', async () => {
        mockGallery();
        const updates = await computeAlbumVersionUpdates(['/2001/']);
        expect([...updates.puts.keys()].sort()).toEqual(['content:/', 'content:/2001/', 'nav:/']);
    });

    test('a deleted album loses its keys and its parent is recomputed', async () => {
        mockGallery({ dayExists: false });
        const updates = await computeAlbumVersionUpdates(['/2001/12-31/']);
        expect([...updates.puts.keys()].sort()).toEqual(['content:/2001/', 'nav:/2001/']);
        expect([...updates.deletes].sort()).toEqual(['content:/2001/12-31/', 'nav:/2001/12-31/']);
    });

    test('a batch fetches each album once', async () => {
        mockGallery();
        await computeAlbumVersionUpdates(['/2001/12-31/a.jpg', '/2001/12-31/b.jpg', '/2001/12-31/']);
        const dayAlbumGets = mockDocClient
            .commandCalls(GetCommand)
            .filter((call) => call.args[0].input.Key?.itemName === '12-31');
        expect(dayAlbumGets).toHaveLength(1);
    });

    test('versions are stable across runs and change with content', async () => {
        mockGallery();
        const before = await computeAlbumVersionUpdates(['/2001/12-31/']);
        const again = await computeAlbumVersionUpdates(['/2001/12-31/']);
        expect(again.puts).toEqual(before.puts);

        const edited = { ...day, description: 'Edited' };
        mockDocClient.on(GetCommand, { Key: { parentPath: '/2001/', itemName: '12-31' } }).resolves({ Item: edited });
        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
            .resolves({ Items: [edited] });
        const after = await computeAlbumVersionUpdates(['/2001/12-31/']);
        expect(after.puts.get('content:/2001/12-31/')).not.toBe(before.puts.get('content:/2001/12-31/'));
        // The year's child list carries the description, so its version moves too; its nav does not
        expect(after.puts.get('content:/2001/')).not.toBe(before.puts.get('content:/2001/'));
        expect(after.puts.get('nav:/2001/')).toBe(before.puts.get('nav:/2001/'));
    });

    test('nav version ignores fields prev/next are not computed from', async () => {
        mockGallery();
        const before = await computeAlbumVersionUpdates(['/2001/12-31/']);
        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2001/' } })
            .resolves({ Items: [{ ...day, published: false }] });
        const after = await computeAlbumVersionUpdates(['/2001/12-31/']);
        expect(after.puts.get('nav:/2001/')).not.toBe(before.puts.get('nav:/2001/'));
    });
});

function record(parentPath: string, itemName: string, eventName: string) {
    return { eventName, dynamodb: { Keys: { parentPath: { S: parentPath }, itemName: { S: itemName } } } };
}
