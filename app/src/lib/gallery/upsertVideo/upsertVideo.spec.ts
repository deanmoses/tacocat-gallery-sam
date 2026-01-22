import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { upsertVideo } from './upsertVideo';

const mockDocClient = mockClient(DynamoDBDocumentClient);

const videoPath = '/2001/12-31/video.mp4';
const versionId = 'abc123';
const dimensions = { width: 1920, height: 1080 };
const duration = 120;

afterEach(() => {
    mockDocClient.reset();
});

describe('upsertVideo validation', () => {
    test('fail on invalid videoPath', async () => {
        await expect(upsertVideo('/invalid_path', versionId, dimensions, duration)).rejects.toThrow(/invalid.*path/i);
    });

    test('fail on image path (not video)', async () => {
        await expect(upsertVideo('/2001/12-31/image.jpg', versionId, dimensions, duration)).rejects.toThrow(
            /invalid.*path/i,
        );
    });

    test('fail on missing versionId', async () => {
        await expect(upsertVideo(videoPath, '', dimensions, duration)).rejects.toThrow(/versionId/i);
    });
});

describe('upsertVideo DynamoDB write', () => {
    test('writes correct fields to DynamoDB', async () => {
        await expect(upsertVideo(videoPath, versionId, dimensions, duration)).resolves.not.toThrow();

        const updateInput = mockDocClient.commandCalls(UpdateCommand)?.[0]?.args[0]?.input;
        if (!updateInput) throw new Error('No update command');

        expect(updateInput.Key).toEqual({
            parentPath: '/2001/12-31/',
            itemName: 'video.mp4',
        });

        expect(updateInput.ExpressionAttributeValues?.[':itemType']).toEqual('image');
        expect(updateInput.ExpressionAttributeValues?.[':mediaType']).toEqual('video');
        // No :id field - path-based storage
        expect(updateInput.ExpressionAttributeValues?.[':id']).toBeUndefined();
        expect(updateInput.ExpressionAttributeValues?.[':versionId']).toEqual(versionId);
        expect(updateInput.ExpressionAttributeValues?.[':dimensions']).toEqual(dimensions);
        expect(updateInput.ExpressionAttributeValues?.[':duration']).toEqual(duration);
        expect(updateInput.ExpressionAttributeValues?.[':updatedOn']).toBeDefined();
    });

    test('uses duration alias for reserved word', async () => {
        await upsertVideo(videoPath, versionId, dimensions, duration);

        const updateInput = mockDocClient.commandCalls(UpdateCommand)?.[0]?.args[0]?.input;
        if (!updateInput) throw new Error('No update command');

        expect(updateInput.ExpressionAttributeNames?.['#dur']).toEqual('duration');
        expect(updateInput.UpdateExpression).toContain('#dur = :duration');
    });

    test('accepts .mov video path', async () => {
        await expect(upsertVideo('/2001/12-31/video.mov', versionId, dimensions, duration)).resolves.not.toThrow();
    });

    test('accepts .webm video path', async () => {
        await expect(upsertVideo('/2001/12-31/video.webm', versionId, dimensions, duration)).resolves.not.toThrow();
    });
});
