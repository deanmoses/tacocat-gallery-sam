import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { albumExists, imageExists, itemExists } from './itemExists';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

describe('itemExists()', () => {
    describe('Invalid paths', () => {
        const invalidPaths = [
            '',
            '/',
            'adf',
            '2000',
            '/2000',
            '2000/',
            '2000/12-31',
            '2000/12-31/image.jpg',
            '/2000/12-31/image',
        ];
        invalidPaths.forEach((path) => {
            test(`Path should be invalid: [${path}]`, async () => {
                await expect(itemExists(path)).rejects.toThrow(/malformed/i);
            });
        });
    });

    test('Item exists', async () => {
        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({ Item: { itemName: '12-31' } });
        const result = await itemExists('/2001/12-31/');
        expect(result).toBe(true);
    });

    test("Item doesn't exist", async () => {
        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({});
        const result = await itemExists('/2001/12-31/');
        expect(result).toBe(false);
    });
});

describe('albumExists()', () => {
    describe('Invalid album paths', () => {
        const invalidPaths = ['', '/', 'adf', '2000', '/2000', '2000/', '2000/12-31', '/2000/12-31/image.jpg'];
        invalidPaths.forEach((path) => {
            test(`Path should be invalid: [${path}]`, async () => {
                await expect(albumExists(path)).rejects.toThrow(/invalid/i);
            });
        });
    });

    test("Album doesn't exist in DynamoDB", async () => {
        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({});
        const result = await albumExists('/2001/12-31/');
        expect(result).toBe(false);
    });

    test('Published album should exist for guest', async () => {
        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({ Item: { published: true } });
        const result = await itemExists('/2001/12-31/');
        expect(result).toBe(true);
    });

    test('Unpublished album should not exist for guest', async () => {
        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({ Item: { itemName: '2001' } });
        const result = await albumExists('/2001/12-31/');
        expect(result).toBe(false);
    });

    test('Unpublished album should exist for admin', async () => {
        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({ Item: { itemName: '2001' } });
        const includeUnpublishedAlbums = true;
        const result = await albumExists('/2001/12-31/', includeUnpublishedAlbums);
        expect(result).toBe(true);
    });
});

describe('imageExists()', () => {
    describe('Invalid image paths', () => {
        const invalidPaths = ['', '/', '/2000/', '/2000/12-31/', '2000/12-31/image.jpg'];
        invalidPaths.forEach((path) => {
            test(`Path should be invalid: [${path}]`, async () => {
                await expect(imageExists(path)).rejects.toThrow(/invalid/i);
            });
        });
    });

    test("Image doesn't exist in DynamoDB", async () => {
        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({});
        const result = await imageExists('/2001/12-31/image.jpg');
        expect(result).toBe(false);
    });

    test('Image in published album should exist for guest', async () => {
        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({ Item: { published: true } });
        const result = await imageExists('/2001/12-31/image.jpg');
        expect(result).toBe(true);
    });

    test('Image in unpublished album should not exist for guest', async () => {
        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({ Item: { itemName: 'image.jpg' } });
        const result = await imageExists('/2001/12-31/image.jpg');
        expect(result).toBe(false);
    });

    test('Image in unpublished album should exist for admin', async () => {
        // Mock out the AWS method
        mockDocClient.on(GetCommand).resolves({ Item: { itemName: 'image.jpg' } });
        const includeUnpublishedAlbums = true;
        const result = await imageExists('/2001/12-31/image.jpg', includeUnpublishedAlbums);
        expect(result).toBe(true);
    });
});
