import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { renameAlbum } from './renameAlbum';

const mockS3Client = mockClient(S3Client);
const mockDDBClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDDBClient.reset();
    mockS3Client.reset();
});

describe('Invalid Existing Album Paths', () => {
    const paths = [
        '',
        'adf',
        '2000',
        '/2000',
        '2000/',
        '2000/12-31',
        '2000/12-31/',
        ' /2000/12-31/', // leading space
        ' /2000/12-31/ ', // trailing space
        '2000/12-31/image.jpg',
        '/2000/12-31/image',
        '/2000/12-31/image.jpg', // image, not album
    ];
    paths.forEach((path) => {
        test(`Invalid: [${path}]`, async () => {
            await expect(renameAlbum(path, '01-01')).rejects.toThrow(/invalid|malformed/i);
            expect(mockDDBClient.calls().length).toBe(0);
            expect(mockS3Client.calls().length).toBe(0);
        });
    });
});

test('Cannot rename root album', async () => {
    await expect(renameAlbum('/', '01-01')).rejects.toThrow(/root/i);
});

describe('Cannot rename year albums', () => {
    const paths = ['/2001/', '/2020/'];
    paths.forEach((path) => {
        test(`Invalid: [${path}]`, async () => {
            await expect(renameAlbum(path, '01-01')).rejects.toThrow(/year/i);
            expect(mockDDBClient.calls().length).toBe(0);
            expect(mockS3Client.calls().length).toBe(0);
        });
    });
});

test('Cannot rename to same name', async () => {
    await expect(renameAlbum('/2001/01-01/', '01-01')).rejects.toThrow(/same/i);
});
