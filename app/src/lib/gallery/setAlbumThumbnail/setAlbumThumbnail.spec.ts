import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { setTestEnv } from '../../lambda_utils/Env';
import { setAlbumThumbnail } from './setAlbumThumbnail';

const mockDocClient = mockClient(DynamoDBDocumentClient);
setTestEnv({ GALLERY_ITEM_DDB_TABLE: 'notRealTable' });

afterEach(() => {
    mockDocClient.reset();
});

describe('Invalid Input', () => {
    test('blank album path', async () => {
        const albumPath = '';
        const imagePath = '/2001/12-31/image.jpg';
        await expect(setAlbumThumbnail(albumPath, imagePath)).rejects.toThrow(/invalid.*album/i);
    });

    test('root album path', async () => {
        const albumPath = '/';
        const imagePath = '/2001/12-31/image.jpg';
        await expect(setAlbumThumbnail(albumPath, imagePath)).rejects.toThrow(/root/i);
    });

    test('malformed image path', async () => {
        const albumPath = '/2001/12-31/';
        const imagePath = '/2001/12-31/';
        await expect(setAlbumThumbnail(albumPath, imagePath)).rejects.toThrow(/invalid.*image/i);
    });

    test('blank image path', async () => {
        const albumPath = '/2001/12-31/';
        const imagePath = '';
        await expect(setAlbumThumbnail(albumPath, imagePath)).rejects.toThrow(/invalid.*image/i);
    });
});

describe('Valid Input', () => {
    test('Basic success path', async () => {
        expect.assertions(5);

        const albumPath = '/2001/12-31/';
        const imagePath = '/2001/12-31/image.jpg';
        const timestamp = new Date().toISOString();

        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({
            Item: { fileUpdatedOn: timestamp },
        });

        // do the update
        await setAlbumThumbnail(albumPath, imagePath);

        // did the expected mocks get called?
        const getCalls = mockDocClient.commandCalls(GetCommand);
        expect(getCalls.length).toBe(1);
        expect(getCalls[0].args[0].input.Key?.itemName).toEqual('image.jpg');
        const transactCalls = mockDocClient.commandCalls(TransactWriteCommand);
        expect(transactCalls.length).toBe(1);
        const transactItems = transactCalls[0].args[0].input.TransactItems;
        expect(transactItems?.length).toBe(2);
        if (!!transactItems) {
            expect(transactItems[0].Update?.ConditionExpression).not.toContain('attribute_not_exists');
        }
    });
});
