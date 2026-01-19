import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { renameMedia } from './renameMedia';

const mockS3Client = mockClient(S3Client);
const mockDDBClient = mockClient(DynamoDBDocumentClient);

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
            await expect(renameMedia(path, 'image.jpg')).rejects.toThrow(/invalid|malformed/i);
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
        'IMAGE.JPG', // capitals
        'image.JPG', // capitals
        'IMAGE.jpg', // capitals
    ];
    imageNames.forEach((imageName) => {
        test(`Invalid: [${imageName}]`, async () => {
            await expect(renameMedia('/2001/12-31/image.jpg', imageName)).rejects.toThrow(/invalid|malformed/i);
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
            await expect(renameMedia(`/2001/12-31/${oldName}`, newName)).rejects.toThrow(/match/i);
            expect(mockDDBClient.calls().length).toBe(0);
            expect(mockS3Client.calls().length).toBe(0);
        });
    });
});

describe('Extension comparison is case-insensitive', () => {
    // Files can be uploaded with uppercase extensions (e.g., photo.JPG from cameras)
    // but new names must be lowercase per isValidMediaNameStrict.
    // Extension comparison should still allow renaming .JPG to .jpg
    test('Allows renaming .JPG to .jpg', async () => {
        // Passes validation, fails on "not found" - proving extension check passed
        await expect(renameMedia('/2001/12-31/photo.JPG', 'newphoto.jpg')).rejects.toThrow(/not found/i);
        expect(mockDDBClient.calls().length).toBeGreaterThan(0);
    });

    test('Allows renaming .MP4 to .mp4', async () => {
        await expect(renameMedia('/2001/12-31/video.MP4', 'newvideo.mp4')).rejects.toThrow(/not found/i);
        expect(mockDDBClient.calls().length).toBeGreaterThan(0);
    });
});

test('Fail if old and new are same name', async () => {
    await expect(renameMedia('/2001/12-31/image.jpg', 'image.jpg')).rejects.toThrow(/same/i);
});

test.todo("Fail if old image doesn't exist");
test.todo('Fail if new image has same name as an existing image');

// Video rename tests
describe('Video rename validation', () => {
    describe('Invalid existing video paths', () => {
        const invalidPaths = [
            '/2000/12-31/video', // no extension
            '2000/12-31/video.mp4', // no starting /
            '/2000/12-31/', // album, not video
        ];
        invalidPaths.forEach((path) => {
            test(`Invalid: [${path}]`, async () => {
                await expect(renameMedia(path, 'newvideo.mp4')).rejects.toThrow(/invalid|malformed/i);
                expect(mockDDBClient.calls().length).toBe(0);
                expect(mockS3Client.calls().length).toBe(0);
            });
        });
    });

    describe('Invalid new video names', () => {
        const invalidNames = [
            '',
            'video', // no extension
            '/newvideo.mp4', // has path
            'VIDEO.MP4', // capitals
            'video.MP4', // capitals
            'new-video.mp4', // hyphen
            '_video.mp4', // underscore at start
            'video_.mp4', // underscore at end
        ];
        invalidNames.forEach((name) => {
            test(`Invalid: [${name}]`, async () => {
                await expect(renameMedia('/2001/12-31/video.mp4', name)).rejects.toThrow(/invalid|malformed/i);
                expect(mockDDBClient.calls().length).toBe(0);
                expect(mockS3Client.calls().length).toBe(0);
            });
        });
    });

    describe('Video extensions must match', () => {
        const mismatchedPairs = [
            { oldName: 'video.mp4', newName: 'newvideo.mov' },
            { oldName: 'video.mov', newName: 'newvideo.mp4' },
            { oldName: 'video.mp4', newName: 'newvideo.jpg' }, // video to image
        ];
        mismatchedPairs.forEach((pair) => {
            test(`Mismatch: [${pair.oldName}] -> [${pair.newName}]`, async () => {
                await expect(renameMedia(`/2001/12-31/${pair.oldName}`, pair.newName)).rejects.toThrow(/match/i);
                expect(mockDDBClient.calls().length).toBe(0);
                expect(mockS3Client.calls().length).toBe(0);
            });
        });
    });

    test('Fail if video old and new are same name', async () => {
        await expect(renameMedia('/2001/12-31/video.mp4', 'video.mp4')).rejects.toThrow(/same/i);
    });

    describe('Valid video paths accepted', () => {
        const validExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp'];
        validExtensions.forEach((ext) => {
            test(`Valid video extension: .${ext}`, async () => {
                // Path/name validation passes, but fails on "media not found" because
                // the mock DDB returns empty. This proves validation didn't reject it.
                await expect(renameMedia(`/2001/12-31/video.${ext}`, `newvideo.${ext}`)).rejects.toThrow(/not found/i);
                // DDB was queried, meaning we got past path validation
                expect(mockDDBClient.calls().length).toBeGreaterThan(0);
            });
        });
    });
});
