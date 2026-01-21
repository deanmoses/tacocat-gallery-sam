import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ExecuteStatementCommand } from '@aws-sdk/lib-dynamodb';
import { updateMedia } from './updateMedia';

const mockDocClient = mockClient(DynamoDBDocumentClient);

const imagePath = '/2001/12-31/image.jpg';

afterEach(() => {
    mockDocClient.reset();
});

test('fail on invalid imagePath', async () => {
    await expect(updateMedia('/invalid_path', { description: 'Desc 1' })).rejects.toThrow(/malformed.*path/i);
});

test('fail on no attributes', async () => {
    await expect(updateMedia(imagePath, {})).rejects.toThrow(/attributes/i);
});

test('fail on unknown attribute', async () => {
    await expect(
        updateMedia(imagePath, { unknownAttr: '' } as unknown as Record<string, string | boolean>),
    ).rejects.toThrow(/unknown.*attribute/i);
});

test('title', async () => {
    await expect(updateMedia(imagePath, { title: 'Title 1' })).resolves.not.toThrow();
    const updateInput = mockDocClient.commandCalls(ExecuteStatementCommand)?.[0]?.args[0]?.input;
    if (!updateInput) throw new Error(`No update command`);
    expect(updateInput.Statement).toContain('title');
    expect(updateInput.Statement).not.toContain('description');
});

test('blank title', async () => {
    await expect(updateMedia(imagePath, { title: '' })).resolves.not.toThrow();
    const updateInput = mockDocClient.commandCalls(ExecuteStatementCommand)?.[0]?.args[0]?.input;
    if (!updateInput) throw new Error(`No update command`);
    expect(updateInput.Statement).toContain('title');
});

test('description', async () => {
    await expect(updateMedia(imagePath, { description: 'Desc 1' })).resolves.not.toThrow();
    const updateInput = mockDocClient.commandCalls(ExecuteStatementCommand)?.[0]?.args[0]?.input;
    if (!updateInput) throw new Error(`No update command`);
    expect(updateInput.Statement).toContain('description');
    expect(updateInput.Statement).not.toContain('title');
});

test('title & description', async () => {
    await expect(updateMedia(imagePath, { title: 'Title 1', description: 'Desc 1' })).resolves.not.toThrow();
    const updateInput = mockDocClient.commandCalls(ExecuteStatementCommand)?.[0]?.args[0]?.input;
    if (!updateInput) throw new Error(`No update command`);
    expect(updateInput.Statement).toContain('title');
    expect(updateInput.Statement).toContain('description');
});
