import { mockClient } from 'aws-sdk-client-mock';
import { ConditionalCheckFailedException, TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { updateAlbum } from './updateAlbum';
import { AlbumUpdateRequest } from '../galleryTypes';

const mockDocClient = mockClient(DynamoDBDocumentClient);
const albumPath = '/2001/12-31/';
const yearAlbumPath = '/2001/';

function transactionCanceled(...codes: string[]): TransactionCanceledException {
    return new TransactionCanceledException({
        $metadata: {},
        message: 'Transaction cancelled',
        CancellationReasons: codes.map((Code) => ({ Code })),
    });
}

afterEach(() => {
    mockDocClient.reset();
});

test('cannot update root album', async () => {
    await expect(updateAlbum('/', { title: 'Title' })).rejects.toThrow(/root/i);
    expect(mockDocClient.calls().length).toBe(0);
});

test('fail on unknown attribute', async () => {
    await expect(updateAlbum(albumPath, { unknownAttr: '' } as AlbumUpdateRequest)).rejects.toThrow(/unknown/i);
});

test('empty data', async () => {
    expect.assertions(1);
    await expect(updateAlbum(albumPath, {})).rejects.toThrow(/No attributes/);
});

test('published must be a boolean', async () => {
    await expect(updateAlbum(albumPath, { published: 'yes' } as unknown as AlbumUpdateRequest)).rejects.toThrow(
        /boolean/,
    );
});

test.each([
    ['description', { description: 'New Description 1' }],
    ['blank description', { description: '' }],
    ['summary', { summary: 'New Summary 1' }],
    ['blank summary', { summary: '' }],
    ['published->false', { published: false }],
])('%s is a plain conditional update', async (_name, attrs) => {
    await expect(updateAlbum(albumPath, attrs)).resolves.not.toThrow();

    const updates = mockDocClient.commandCalls(UpdateCommand);
    expect(updates).toHaveLength(1);
    const input = updates[0].args[0].input;
    expect(input.Key).toEqual({ parentPath: yearAlbumPath, itemName: '12-31' });
    expect(input.ConditionExpression).toMatch(/attribute_exists/);
    expect(input.UpdateExpression).toMatch(/updatedOn/);
    for (const [field, value] of Object.entries(attrs)) {
        expect(input.ExpressionAttributeNames).toHaveProperty(`#${field}`, field);
        expect(input.ExpressionAttributeValues).toHaveProperty(`:${field}`, value);
    }
    expect(mockDocClient.commandCalls(TransactWriteCommand)).toHaveLength(0);
});

test('album not found', async () => {
    mockDocClient
        .on(UpdateCommand)
        .rejects(new ConditionalCheckFailedException({ $metadata: {}, message: 'The conditional request failed' }));
    await expect(updateAlbum(albumPath, { description: 'x' })).rejects.toThrow(/not found/i);
});

describe('publishing a day album', () => {
    it('is conditioned on the parent inside the write, never on a prior read', async () => {
        mockDocClient.on(TransactWriteCommand).resolves({});

        await expect(updateAlbum(albumPath, { published: true })).resolves.not.toThrow();

        expect(mockDocClient.commandCalls(GetCommand)).toHaveLength(0);
        expect(mockDocClient.commandCalls(UpdateCommand)).toHaveLength(0);
        const transactions = mockDocClient.commandCalls(TransactWriteCommand);
        expect(transactions).toHaveLength(1);
        const items = transactions[0].args[0].input.TransactItems ?? [];
        expect(items).toHaveLength(2);

        const check = items[0].ConditionCheck;
        expect(check?.Key).toEqual({ parentPath: '/', itemName: '2001' });
        expect(check?.ConditionExpression).toMatch(/#published = :published/);
        expect(check?.ExpressionAttributeNames).toEqual({ '#published': 'published' });
        expect(check?.ExpressionAttributeValues).toEqual({ ':published': true });

        const update = items[1].Update;
        expect(update?.Key).toEqual({ parentPath: yearAlbumPath, itemName: '12-31' });
        expect(update?.ConditionExpression).toMatch(/attribute_exists/);
        expect(update?.ExpressionAttributeValues).toHaveProperty(':published', true);
    });

    it('fails when the parent is not published', async () => {
        mockDocClient.on(TransactWriteCommand).rejects(transactionCanceled('ConditionalCheckFailed', 'None'));
        await expect(updateAlbum(albumPath, { published: true })).rejects.toThrow(/parent/);
    });

    it('reports a missing album as not found', async () => {
        mockDocClient.on(TransactWriteCommand).rejects(transactionCanceled('None', 'ConditionalCheckFailed'));
        await expect(updateAlbum(albumPath, { published: true })).rejects.toThrow(/not found/i);
    });

    it('rethrows other transaction failures', async () => {
        mockDocClient.on(TransactWriteCommand).rejects(transactionCanceled('None', 'TransactionConflict'));
        await expect(updateAlbum(albumPath, { published: true })).rejects.toThrow(TransactionCanceledException);
    });

    it('all fields at once', async () => {
        mockDocClient.on(TransactWriteCommand).resolves({});
        await expect(
            updateAlbum(albumPath, { description: 'Description 2', summary: 'Summary 2', published: true }),
        ).resolves.not.toThrow();
        const update = mockDocClient.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems?.[1].Update;
        expect(update?.ExpressionAttributeValues).toEqual(
            expect.objectContaining({ ':description': 'Description 2', ':summary': 'Summary 2', ':published': true }),
        );
    });
});

test('publishing a year album has no parent to check', async () => {
    await expect(updateAlbum(yearAlbumPath, { published: true })).resolves.not.toThrow();
    expect(mockDocClient.commandCalls(TransactWriteCommand)).toHaveLength(0);
    expect(mockDocClient.commandCalls(UpdateCommand)).toHaveLength(1);
});
