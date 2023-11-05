import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { setAlbumThumbnail, setImageAsParentAlbumThumbnailIfNoneExists } from './setAlbumThumbnail';

const mockDocClient = mockClient(DynamoDBDocumentClient);

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
        expect.assertions(8);

        const albumPath = '/2001/12-31/';
        const imagePath = '/2001/12-31/image.jpg';
        const timestamp = new Date().toISOString();

        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({
            Item: { fileUpdatedOn: timestamp },
        });

        // do the update
        const thumbWasReplaced = await setAlbumThumbnail(albumPath, imagePath);

        expect(thumbWasReplaced).toBe(true);

        // did the expected mocks get called?
        const getCalls = mockDocClient.commandCalls(GetCommand);
        expect(getCalls.length).toBe(2);
        const imageGetCall = getCalls[1].args[0];
        expect(imageGetCall.input.Key?.parentPath).toEqual('/2001/12-31/');
        expect(imageGetCall.input.Key?.itemName).toEqual('image.jpg');
        const transactCalls = mockDocClient.commandCalls(UpdateCommand);
        expect(transactCalls.length).toBe(1);
        expect(transactCalls).toBeDefined();
        const updateCommand = transactCalls[0].args[0].input;
        expect(updateCommand).toBeDefined();
        if (!!updateCommand) {
            expect(updateCommand?.ConditionExpression).not.toContain('attribute_not_exists');
        }
    });

    test("Don't replace thumbnail", async () => {
        expect.assertions(8);

        const albumPath = '/2001/12-31/';
        const imagePath = '/2001/12-31/anotherImage.jpg';
        const timestamp = new Date().toISOString();

        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({
            Item: { fileUpdatedOn: timestamp },
        });

        // do the update
        const thumbWasReplaced = await setAlbumThumbnail(
            albumPath,
            imagePath,
            false /* don't replace existing thumb */,
        );

        // TODO: mock throwing a Condition exception and switch this check to true
        expect(thumbWasReplaced).toBe(true);

        // did the expected mocks get called?
        const getCalls = mockDocClient.commandCalls(GetCommand);
        expect(getCalls.length).toBe(2);
        const imageGetCall = getCalls[1].args[0];
        expect(imageGetCall.input.Key?.parentPath).toEqual('/2001/12-31/');
        expect(imageGetCall.input.Key?.itemName).toEqual('anotherImage.jpg');
        const transactCalls = mockDocClient.commandCalls(UpdateCommand);
        expect(transactCalls).toBeDefined();
        expect(transactCalls.length).toBe(1);
        const updateCommand = transactCalls[0].args[0].input;
        expect(updateCommand).toBeDefined();
        if (!!updateCommand) {
            expect(updateCommand?.ConditionExpression).toContain('attribute_not_exists');
        }
    });

    test('Album does not exist', async () => {
        expect.assertions(1);

        const imagePath = '/1899/12-31/anotherImage.jpg';

        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({
            /* return no album */
        });

        // do the update
        await expect(setImageAsParentAlbumThumbnailIfNoneExists(imagePath)).rejects.toThrow(/album.*not.*found/i);
    });

    test('setImageAsParentAlbumThumbnailIfNoneExists()', async () => {
        expect.assertions(8);

        const imagePath = '/2001/12-31/anotherImage.jpg';
        const timestamp = new Date().toISOString();

        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({
            Item: { fileUpdatedOn: timestamp },
        });

        // do the update
        const thumbWasReplaced = await setImageAsParentAlbumThumbnailIfNoneExists(imagePath);

        // TODO: mock throwing a Condition exception and switch this check to true
        expect(thumbWasReplaced).toBe(true);

        // did the expected mocks get called?
        const getCalls = mockDocClient.commandCalls(GetCommand);
        expect(getCalls.length).toBe(2);
        const imageGetCall = getCalls[1].args[0];
        expect(imageGetCall.input.Key?.parentPath).toEqual('/2001/12-31/');
        expect(imageGetCall.input.Key?.itemName).toEqual('anotherImage.jpg');
        const transactCalls = mockDocClient.commandCalls(UpdateCommand);
        expect(transactCalls).toBeDefined();
        expect(transactCalls.length).toBe(1);
        const updateCommand = transactCalls[0].args[0].input;
        expect(updateCommand).toBeDefined();
        if (!!updateCommand) {
            expect(updateCommand?.ConditionExpression).toContain('attribute_not_exists');
        }
    });
});
