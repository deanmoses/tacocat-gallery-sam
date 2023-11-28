import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { upsertImage } from './upsertImage';
import { ImageCreateRequest } from '../galleryTypes';

const mockDocClient = mockClient(DynamoDBDocumentClient);

const imagePath = '/2001/12-31/image.jpg';

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
