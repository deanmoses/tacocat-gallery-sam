import { setTestEnv } from '../../lambda_utils/Env';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { renameImage } from './renameImage';

const mockS3Client = mockClient(S3Client);
const mockDDBClient = mockClient(DynamoDBDocumentClient);

setTestEnv({
    GALLERY_ITEM_DDB_TABLE: 'notRealTable',
    ORIGINAL_IMAGES_BUCKET: 'notARealBucket',
    DERIVED_IMAGES_BUCKET: 'notARealBucket',
});

afterEach(() => {
    mockDDBClient.reset();
    mockS3Client.reset();
});

describe('Invalid Existing Image Paths', () => {
    const paths = [
        '',
        '/',
        'adf',
        '2000',
        '/2000',
        '2000/',
        '/2000/',
        '2000/12-31',
        '/2000/12-31/', // album, not image
        '2000/12-31/image.jpg', // no starting /
        '/2000/12-31/image', // no extension
    ];
    paths.forEach((path) => {
        test(`Path should be invalid: [${path}]`, async () => {
            await expect(renameImage(path, 'image.jpg')).rejects.toThrow(/invalid|malformed/i);
            expect(mockDDBClient.calls().length).toBe(0);
            expect(mockS3Client.calls().length).toBe(0);
        });
    });
});

describe('Invalid New Image Names', () => {
    const imageNames = [
        '',
        '/',
        '.',
        'newName',
        '2000',
        '/2000',
        '2000/',
        '/2000/',
        '2000/12-31',
        '/2000/12-31/',
        '2000/12-31/image.jpg',
        '/2000/12-31/image.jpg',
        '/2000/12-31/image',
        '/newName.jpg',
        '/newName.gif',
        '.jpg',
        'a^b.jpg',
        'a b.jpg',
    ];
    imageNames.forEach((imageName) => {
        test(`Name should be invalid: [${imageName}]`, async () => {
            await expect(renameImage('/2001/12-31/image.jpg', imageName)).rejects.toThrow(/invalid|malformed/i);
            expect(mockDDBClient.calls().length).toBe(0);
            expect(mockS3Client.calls().length).toBe(0);
        });
    });
});

describe("Extensions don't match", () => {
    const imageNamePairs = [
        { oldName: 'newName.png', newName: 'newName.jpeg' },
        { oldName: 'newName.jpg', newName: 'newName.jpeg' },
        { oldName: 'newName.jpg', newName: 'newName.png' },
        { oldName: 'newName.jpg', newName: 'newName.gif' },
    ];
    imageNamePairs.forEach((pair) => {
        const oldName = pair.oldName;
        const newName = pair.newName;
        test(`Extensions shouldn't match: [${oldName}] [${newName}]`, async () => {
            await expect(renameImage(`/2001/12-31/${oldName}`, newName)).rejects.toThrow(/match/i);
            expect(mockDDBClient.calls().length).toBe(0);
            expect(mockS3Client.calls().length).toBe(0);
        });
    });
});

test('Nonexistent Image', async () => {
    // Mock out item not found in DynamoDB
    mockDDBClient.on(GetCommand).resolves({
        Item: {},
    });
    await expect(renameImage('/1899/12-31/noSuchImage.jpg', 'newImage.jpg')).rejects.toThrow(/not found/i);
    expect(mockDDBClient.commandCalls(GetCommand).length).toBe(1);
    expect(mockDDBClient.commandCalls(DeleteItemCommand).length).toBe(0);
    expect(mockS3Client.calls().length).toBe(0);
});
