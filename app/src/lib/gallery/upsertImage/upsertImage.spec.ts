import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mergeTags, upsertImage } from './upsertImage';
import { ImageCreateRequest } from '../galleryTypes';

const mockDocClient = mockClient(DynamoDBDocumentClient);

const imagePath = '/2001/12-31/image.jpg';

beforeEach(() => {
    // Default mock for GetCommand - return empty Item (no existing tags)
    mockDocClient.on(GetCommand).resolves({ Item: {} });
});

afterEach(() => {
    mockDocClient.reset();
});

test('fail on invalid imagePath', async () => {
    await expect(upsertImage('/invalid_path', { versionId: '123' })).rejects.toThrow(/invalid.*path/i);
});

test('fail on no versionId', async () => {
    await expect(upsertImage(imagePath, {} as ImageCreateRequest)).rejects.toThrow(/versionId/i);
});

test('fail on unknown attribute', async () => {
    await expect(upsertImage(imagePath, { versionId: '123', unknownAttr: '' } as ImageCreateRequest)).rejects.toThrow(
        /invalid.*attribute/i,
    );
});

test('no additional attrs', async () => {
    await expect(upsertImage(imagePath, { versionId: '123' })).resolves.not.toThrow();
    const updateInput = mockDocClient.commandCalls(UpdateCommand)?.[0]?.args[0]?.input;
    if (!updateInput) throw new Error(`No update command`);
    expect(updateInput.ExpressionAttributeValues?.[':versionId']).toEqual('123');
});

test('description', async () => {
    await expect(upsertImage(imagePath, { versionId: '123', description: 'Desc 1' })).resolves.not.toThrow();
    const updateInput = mockDocClient.commandCalls(UpdateCommand)?.[0]?.args[0]?.input;
    if (!updateInput) throw new Error(`No update command`);
    expect(updateInput.ExpressionAttributeValues?.[':versionId']).toEqual('123');
    expect(updateInput.UpdateExpression).toContain('description = if_not_exists(description, :description)');
    expect(updateInput.ExpressionAttributeValues?.[':description']).toEqual('Desc 1');
});

// mergeTags helper function tests
describe('mergeTags', () => {
    test('both undefined returns undefined', () => {
        expect(mergeTags(undefined, undefined)).toBeUndefined();
    });

    test('existing only returns existing', () => {
        expect(mergeTags(['A', 'B'], undefined)).toEqual(['A', 'B']);
    });

    test('incoming only returns incoming', () => {
        expect(mergeTags(undefined, ['A', 'B'])).toEqual(['A', 'B']);
    });

    test('merges and deduplicates', () => {
        expect(mergeTags(['A'], ['A', 'B'])).toEqual(['A', 'B']);
    });

    test('filters empty strings', () => {
        expect(mergeTags(['', 'A', '  '], ['B', ''])).toEqual(['A', 'B']);
    });

    test('empty arrays return undefined', () => {
        expect(mergeTags([], [])).toBeUndefined();
    });
});

// upsertImage tag behavior tests
describe('upsertImage tags', () => {
    test('empty array not saved', async () => {
        await upsertImage(imagePath, { versionId: '123', tags: [] });
        const updateInput = mockDocClient.commandCalls(UpdateCommand)?.[0]?.args[0]?.input;
        if (!updateInput) throw new Error('No update command');
        expect(updateInput.UpdateExpression).not.toContain('tags');
        expect(updateInput.ExpressionAttributeValues?.[':tags']).toBeUndefined();
    });

    test('null not saved', async () => {
        await upsertImage(imagePath, { versionId: '123', tags: null as unknown as string[] });
        const updateInput = mockDocClient.commandCalls(UpdateCommand)?.[0]?.args[0]?.input;
        if (!updateInput) throw new Error('No update command');
        expect(updateInput.UpdateExpression).not.toContain('tags');
        expect(updateInput.ExpressionAttributeValues?.[':tags']).toBeUndefined();
    });

    test('merges with existing', async () => {
        mockDocClient.on(GetCommand).resolves({ Item: { tags: ['A'] } });
        await upsertImage(imagePath, { versionId: '123', tags: ['B'] });
        const updateInput = mockDocClient.commandCalls(UpdateCommand)?.[0]?.args[0]?.input;
        if (!updateInput) throw new Error('No update command');
        expect(updateInput.UpdateExpression).toContain('tags = :tags');
        expect(updateInput.ExpressionAttributeValues?.[':tags']).toEqual(['A', 'B']);
    });

    test('existing preserved when incoming empty', async () => {
        mockDocClient.on(GetCommand).resolves({ Item: { tags: ['A'] } });
        await upsertImage(imagePath, { versionId: '123', tags: [] });
        const updateInput = mockDocClient.commandCalls(UpdateCommand)?.[0]?.args[0]?.input;
        if (!updateInput) throw new Error('No update command');
        // When incoming is empty, merged result is just existing ['A']
        // So tags SHOULD be in the update expression
        expect(updateInput.UpdateExpression).toContain('tags = :tags');
        expect(updateInput.ExpressionAttributeValues?.[':tags']).toEqual(['A']);
    });
});
