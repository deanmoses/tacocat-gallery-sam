import { setTestEnv } from '../../lambda_utils/Env';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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
        test(`Invalid: [${path}]`, async () => {
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
        ' .jpg',
        'a b.jpg',
        'a-b.jpg',
        'a.b.jpg',
        'a%b.jpg',
        'a^b.jpg',
        'a b.jpg',
        '_.jpg',
        '__.jpg',
        '_image.jpg', // _ at beginning
        'image_.jpg', // _ at end
    ];
    imageNames.forEach((imageName) => {
        test(`Invalid: [${imageName}]`, async () => {
            await expect(renameImage('/2001/12-31/image.jpg', imageName)).rejects.toThrow(/invalid|malformed/i);
            expect(mockDDBClient.calls().length).toBe(0);
            expect(mockS3Client.calls().length).toBe(0);
        });
    });
});

describe("Extensions don't match", () => {
    const imageNamePairs = [
        { oldName: 'name.png', newName: 'new_name.jpg' },
        { oldName: 'name.jpg', newName: 'new_name.png' },
        { oldName: 'name.jpg', newName: 'new_name.gif' },
    ];
    imageNamePairs.forEach((pair) => {
        const oldName = pair.oldName;
        const newName = pair.newName;
        test(`Mismatch: [${oldName}] [${newName}]`, async () => {
            await expect(renameImage(`/2001/12-31/${oldName}`, newName)).rejects.toThrow(/match/i);
            expect(mockDDBClient.calls().length).toBe(0);
            expect(mockS3Client.calls().length).toBe(0);
        });
    });
});

test('Fail if old and new are same name', async () => {
    await expect(renameImage('/2001/12-31/image.jpg', 'image.png')).rejects.toThrow(/extension/i);
});

test.todo("Fail if old image doesn't exist");
test.todo('Fail if new image has same name as an existing image');
