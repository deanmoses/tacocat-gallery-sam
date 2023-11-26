import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ExecuteStatementCommand } from '@aws-sdk/lib-dynamodb';
import { updateAlbum } from './updateAlbum';
import { AlbumUpdateRequest } from '../galleryTypes';

const mockDocClient = mockClient(DynamoDBDocumentClient);
const albumPath = '/2001/12-31/';

afterEach(() => {
    mockDocClient.reset();
});

test('cannot update root album', async () => {
    await expect(updateAlbum('/', { title: 'Title' })).rejects.toThrow(/root/i);
    expect(mockDocClient.calls.length).toBe(0);
});

test('fail on unknown attribute', async () => {
    await expect(updateAlbum(albumPath, { unknownAttr: '' } as AlbumUpdateRequest)).rejects.toThrow(/unknown/i);
});

test('description', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            description: 'New Description 1',
        }),
    ).resolves.not.toThrow();
});

test('blank description', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            description: '',
        }),
    ).resolves.not.toThrow();
});

test('summary', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            summary: 'New Summary 1',
        }),
    ).resolves.not.toThrow();
});

test('blank summary', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            summary: '',
        }),
    ).resolves.not.toThrow();
});

test('all fields', async () => {
    await expect(
        updateAlbum(albumPath, {
            description: 'Description 2',
            summary: 'Summary 2',
            published: true,
        }),
    ).resolves.not.toThrow();
});

test('published->true', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            published: true,
        }),
    ).resolves.not.toThrow();
});

test('published->false', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            published: false,
        }),
    ).resolves.not.toThrow();
});

test('root album', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum('/', {
            title: 'New Title',
        }),
    ).rejects.toThrow(/root/);
});

test('empty data', async () => {
    expect.assertions(1);
    const attributesToUpdate = {};
    await expect(updateAlbum(albumPath, attributesToUpdate)).rejects.toThrow(/No attributes/);
});

test('null data', async () => {
    expect.assertions(1);
    const attributesToUpdate = undefined as unknown as Record<string, string | boolean>;
    await expect(updateAlbum(albumPath, attributesToUpdate)).rejects.toThrow(/No attributes/);
});

test('only bad data', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            noSuchAttribute: 'some value',
        } as AlbumUpdateRequest),
    ).rejects.toThrow(/noSuchAttribute/);
});

test('both real and bad data', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            description: 'New Description 3',
            noSuchAttribute: 'some value',
        } as AlbumUpdateRequest),
    ).rejects.toThrow(/noSuchAttribute/);
});

test('Invalid published value: true', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            published: 'true',
        } as unknown as AlbumUpdateRequest),
    ).rejects.toThrow(/published/);
});

test('Invalid published value: 1', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            published: 1,
        } as unknown as AlbumUpdateRequest),
    ).rejects.toThrow(/published/);
});

test('Blank published value', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            published: '',
        } as unknown as AlbumUpdateRequest),
    ).rejects.toThrow(/published/);
});

test('Numerical published value', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum(albumPath, {
            published: '0',
        } as unknown as AlbumUpdateRequest),
    ).rejects.toThrow(/published/);
});

test('Missing albumPath', async () => {
    expect.assertions(1);
    await expect(
        updateAlbum('' /*no album*/, {
            title: 'New Title',
        }),
    ).rejects.toThrow(/path/);
});
