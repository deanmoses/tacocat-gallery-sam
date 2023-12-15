import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { generateUploadUrls } from './generateUploadUrls';

const mockDDBClient = mockClient(DynamoDBDocumentClient);
const mockS3Client = mockClient(S3Client);

afterEach(() => {
    mockDDBClient.reset();
    mockS3Client.reset();
});

describe('Invalid album paths', () => {
    [
        '',
        '/',
        '/2000/',
        '2000/12-31',
        '2000/12-31/',
        '/2000/12-31',
        '/2000/12-31/image.jpg', // image not album
    ].forEach((invalidAlbumPath) => {
        it(`Should fail on invalid album [${invalidAlbumPath}]`, async () => {
            await expect(generateUploadUrls(invalidAlbumPath, ['/2001/12-31/image.jpg'])).rejects.toThrow(/invalid/i);
            expect(mockS3Client.calls().length).toBe(0);
            expect(mockDDBClient.calls().length).toBe(0);
        });
    });
});

describe('Invalid images', () => {
    [
        '',
        '/',
        'adf',
        '2000',
        '/2000',
        '2000/',
        '/2000/',
        'image.jpg', // no album
        '2000/12-31',
        '/2000/12-31/', // album, not image
        '2000/12-31/image.jpg', // no starting /
        '/2000/12-31/image', // no extension
        '/2000/12-31/image.dng', // unsupported file type
        '/2000/12-31/image.heic', // unsupported file type
        '/2000/12-31/image.pdf', // unsupported file type
        '/2000/12-31/image.txt', // unsupported file type
    ].forEach((invalidImagePath) => {
        it(`Should fail on invalid image [${invalidImagePath}]`, async () => {
            await expect(generateUploadUrls('/2001/12-31/', [invalidImagePath])).rejects.toThrow(/invalid/i);
            expect(mockS3Client.calls().length).toBe(0);
        });
    });
});

it('Should fail on mix of valid and invalid image paths', async () => {
    await expect(
        generateUploadUrls('/2001/12-31/', ['/2001/12-31/image.jpg', '/2001/12-31/INVALID', '/2001/12-31/image2.jpg']),
    ).rejects.toThrow(/invalid/i);
    expect(mockS3Client.calls().length).toBe(0);
});

it('Should fail if image is not in album', async () => {
    await expect(generateUploadUrls('/2001/12-31/', ['/1899/01-01/image.jpg'])).rejects.toThrow(/album/i);
    expect(mockS3Client.calls().length).toBe(0);
});

it('Should fail on no images', async () => {
    await expect(generateUploadUrls('/2001/12-31/', [])).rejects.toThrow(/images/i);
    expect(mockS3Client.calls().length).toBe(0);
});

it('Should fail on nonexistent album', async () => {
    await expect(generateUploadUrls('/2001/12-31/', ['/2001/12-31/image.jpg'])).rejects.toThrow(/album/i);
    expect(mockDDBClient.calls().length).toBe(1);
    expect(mockS3Client.calls().length).toBe(0);
});

it('Should succeed', async () => {
    mockDDBClient.on(GetCommand).resolves({ Item: { itemName: '12-31' } }); // Mock DDB to get album
    const urls = await generateUploadUrls('/2001/12-31/', ['/2001/12-31/image.jpg']);
    const url = urls['/2001/12-31/image.jpg'];
    if (!url) throw new Error(`No URL for /2001/12-31/image.jpg`);
    new URL(url); // Throws if invalid URL
    expect(mockDDBClient.calls().length).toBe(1);
    expect(mockS3Client.calls().length).toBe(0); // Shows that generating presigned URLs don't involve a call to S3
});
