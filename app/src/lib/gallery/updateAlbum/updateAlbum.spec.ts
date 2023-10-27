import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { setTestEnv } from '../../lambda_utils/Env';
import { updateAlbum } from './updateAlbum';
import { ExecuteStatementCommandInput } from '@aws-sdk/client-dynamodb';

const mockDocClient = mockClient(DynamoDBDocumentClient);
setTestEnv({ GALLERY_ITEM_DDB_TABLE: 'notRealTable' });
const albumPath = '/2001/12-31/';

//
// TEST SETUP AND TEARDOWN
//

afterEach(() => {
    mockDocClient.reset();
});

//
// TESTS
//

describe('Update Album', () => {
    test('title', async () => {
        expect.assertions(4);
        await expect(
            updateAlbum(albumPath, {
                title: 'New Title 1',
            }),
        ).resolves.not.toThrow();
        const partiQL = (mockDocClient.call(0).args[0].input as ExecuteStatementCommandInput).Statement;
        expect(partiQL).toContain('New Title 1');
        expect(partiQL).toContain('updatedOn');
        expect(partiQL).toContain('notRealTable');
    });

    test('blank title (unset title)', async () => {
        expect.assertions(1);
        await expect(
            updateAlbum(albumPath, {
                title: '',
            }),
        ).resolves.not.toThrow();
    });

    test('description', async () => {
        expect.assertions(1);
        await expect(
            updateAlbum(albumPath, {
                description: 'New Description 1',
            }),
        ).resolves.not.toThrow();
    });

    test('blank description (unset description)', async () => {
        expect.assertions(1);
        await expect(
            updateAlbum(albumPath, {
                description: '',
            }),
        ).resolves.not.toThrow();
    });

    test('title and description', async () => {
        expect.assertions(1);
        await expect(
            updateAlbum(albumPath, {
                title: 'Title 2',
                description: 'Description 2',
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
            }),
        ).rejects.toThrow(/noSuchAttribute/);
    });

    test('both real and bad data', async () => {
        expect.assertions(1);
        await expect(
            updateAlbum(albumPath, {
                title: 'New Title 3',
                noSuchAttribute: 'some value',
            }),
        ).rejects.toThrow(/noSuchAttribute/);
    });

    test('Invalid published value: true', async () => {
        expect.assertions(1);
        await expect(
            updateAlbum(albumPath, {
                published: 'true',
            }),
        ).rejects.toThrow(/published/);
    });

    test('Invalid published value: 1', async () => {
        expect.assertions(1);
        await expect(
            updateAlbum(albumPath, {
                published: 1 as unknown as string,
            }),
        ).rejects.toThrow(/published/);
    });

    test('Blank published value', async () => {
        expect.assertions(1);
        await expect(
            updateAlbum(albumPath, {
                published: '',
            }),
        ).rejects.toThrow(/published/);
    });

    test('Numerical published value', async () => {
        expect.assertions(1);
        await expect(
            updateAlbum(albumPath, {
                published: '0',
            }),
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
});
