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
        await expect(setAlbumThumbnail(albumPath, imagePath)).rejects.toThrow(/invalid.*media/i);
    });

    test('blank image path', async () => {
        const albumPath = '/2001/12-31/';
        const imagePath = '';
        await expect(setAlbumThumbnail(albumPath, imagePath)).rejects.toThrow(/invalid.*media/i);
    });
});

describe('Valid Input', () => {
    test('Basic success path', async () => {
        expect.assertions(5);

        const albumPath = '/2001/12-31/';
        const imagePath = '/2001/12-31/image.jpg';

        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({
            Item: { versionId: '123456789' },
        });

        // do the update
        const thumbWasReplaced = await setAlbumThumbnail(albumPath, imagePath);

        expect(thumbWasReplaced).toBe(true);

        // did the expected mocks get called?
        expect(mockDocClient).toHaveReceivedCommandTimes(GetCommand, 2);
        expect(mockDocClient).toHaveReceivedNthSpecificCommandWith(2, GetCommand, {
            Key: { parentPath: '/2001/12-31/', itemName: 'image.jpg' },
        });
        expect(mockDocClient).toHaveReceivedCommandTimes(UpdateCommand, 1);
        expect(mockDocClient).not.toHaveReceivedCommandWith(UpdateCommand, {
            ConditionExpression: expect.stringContaining('attribute_not_exists'),
        });
    });

    test("Don't replace thumbnail", async () => {
        expect.assertions(5);

        const albumPath = '/2001/12-31/';
        const imagePath = '/2001/12-31/anotherImage.jpg';

        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({
            Item: { versionId: '123456789' },
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
        expect(mockDocClient).toHaveReceivedCommandTimes(GetCommand, 2);
        expect(mockDocClient).toHaveReceivedNthSpecificCommandWith(2, GetCommand, {
            Key: { parentPath: '/2001/12-31/', itemName: 'anotherImage.jpg' },
        });
        expect(mockDocClient).toHaveReceivedCommandTimes(UpdateCommand, 1);
        expect(mockDocClient).toHaveReceivedCommandWith(UpdateCommand, {
            ConditionExpression: expect.stringContaining('attribute_not_exists'),
        });
    });

    test('Album does not exist', async () => {
        expect.assertions(1);

        const imagePath = '/1899/12-31/anotherImage.jpg';

        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({/* return no album */});

        // do the update
        await expect(setImageAsParentAlbumThumbnailIfNoneExists(imagePath)).rejects.toThrow(/album.*not.*found/i);
    });

    test('setImageAsParentAlbumThumbnailIfNoneExists()', async () => {
        expect.assertions(5);

        const imagePath = '/2001/12-31/anotherImage.jpg';

        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({
            Item: { versionId: '123456789' },
        });

        // do the update
        const thumbWasReplaced = await setImageAsParentAlbumThumbnailIfNoneExists(imagePath);

        // TODO: mock throwing a Condition exception and switch this check to true
        expect(thumbWasReplaced).toBe(true);

        // did the expected mocks get called?
        expect(mockDocClient).toHaveReceivedCommandTimes(GetCommand, 2);
        expect(mockDocClient).toHaveReceivedNthSpecificCommandWith(2, GetCommand, {
            Key: { parentPath: '/2001/12-31/', itemName: 'anotherImage.jpg' },
        });
        expect(mockDocClient).toHaveReceivedCommandTimes(UpdateCommand, 1);
        expect(mockDocClient).toHaveReceivedCommandWith(UpdateCommand, {
            ConditionExpression: expect.stringContaining('attribute_not_exists'),
        });
    });
});
