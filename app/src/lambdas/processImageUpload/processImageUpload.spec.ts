import { processImageUpload } from './processImageUpload';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';

const mockDocClient = mockClient(DynamoDBDocumentClient);
const mockS3Client = mockClient(S3Client);

afterEach(() => {
    mockDocClient.reset();
    mockS3Client.reset();
});

describe('Invalid Image S3 Keys', () => {
    const s3keys = [
        '',
        '/',
        'image',
        'image.jpg', // no images in root album
        '/image.jpg',
        '.jpg',
        '2000',
        '/2000',
        '2000/',
        '2000/image.jpg', // no images in year albums
        '2000/12-31',
        '/2000/12-31/image.jpg', // no preceding slash in bucket keys
        '2000/12-31/image',
    ];

    s3keys.forEach((s3key) => {
        test(`S3 key should be invalid: [${s3key}]`, async () => {
            await expect(processImageUpload('bucket', s3key, 'FAKE_VERSION_ID')).rejects.toThrow(/invalid/i);
        });
    });
});

describe('HEIC handling', () => {
    test('HEIC path should be accepted as valid for upload', async () => {
        // Mock S3 GetObjectCommand to return a minimal valid response
        // We use a tiny valid JPEG as test data (Sharp will process it)
        const minimalImageBuffer = Buffer.from(
            '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
            'base64',
        );
        const stream = sdkStreamMixin(Readable.from([minimalImageBuffer]));
        mockS3Client.on(GetObjectCommand).resolves({ Body: stream });
        mockS3Client.on(PutObjectCommand).resolves({});
        mockS3Client.on(DeleteObjectCommand).resolves({});

        // HEIC is valid for upload, so it shouldn't throw "invalid" error
        // This test verifies HEIC paths don't get rejected as invalid
        await expect(processImageUpload('bucket', '2000/12-31/image.heic', 'FAKE_VERSION_ID')).resolves.toBeUndefined();
    });
});
