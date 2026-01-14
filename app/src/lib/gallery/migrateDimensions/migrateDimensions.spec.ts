import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';
import { migrateDimensions } from './migrateDimensions';
import { ImageItem, AlbumItem } from '../galleryTypes';
import * as fs from 'fs';
import * as path from 'path';

const mockDocClient = mockClient(DynamoDBDocumentClient);
const mockS3Client = mockClient(S3Client);

beforeEach(() => {
    mockDocClient.reset();
    mockS3Client.reset();
    process.env.GALLERY_ITEM_DDB_TABLE = 'test-table';
    process.env.ORIGINAL_IMAGES_BUCKET = 'test-bucket';
});

/** Helper to create a mock S3 response with image data */
function createMockS3Response(imageBuffer: Buffer, versionId?: string) {
    const stream = sdkStreamMixin(Readable.from([imageBuffer]));
    return {
        Body: stream,
        VersionId: versionId,
    };
}

/** Load a test image */
function loadTestImage(filename: string): Buffer {
    const imagePath = path.join(__dirname, '../../../test/data/images', filename);
    return fs.readFileSync(imagePath);
}

describe('migrateDimensions input validation', () => {
    test('rejects invalid mode', async () => {
        await expect(migrateDimensions({ mode: 'invalid' as 'diagnose' | 'fix' })).rejects.toThrow(
            "Invalid mode: invalid. Must be 'diagnose' or 'fix'.",
        );
    });

    test('rejects malformed image path', async () => {
        await expect(migrateDimensions({ mode: 'diagnose', image: 'not-a-path' })).rejects.toThrow(
            'Invalid image path: not-a-path',
        );
    });

    test('rejects malformed startFrom path', async () => {
        await expect(migrateDimensions({ mode: 'diagnose', startFrom: 'not-a-path' })).rejects.toThrow(
            'Invalid startFrom path: not-a-path',
        );
    });

    test('rejects unknown fields', async () => {
        await expect(
            migrateDimensions({ mode: 'diagnose', unknownField: 'value' } as Parameters<typeof migrateDimensions>[0]),
        ).rejects.toThrow('Unknown field: unknownField');
    });

    test('rejects both image and startFrom', async () => {
        await expect(
            migrateDimensions({
                mode: 'diagnose',
                image: '/2024/01-15/photo.jpg',
                startFrom: '/2024/01-15/other.jpg',
            }),
        ).rejects.toThrow("Cannot specify both 'image' and 'startFrom'");
    });

    test('accepts valid diagnose mode', async () => {
        // Set up empty album response
        mockDocClient.on(QueryCommand).resolves({ Items: [] });

        const result = await migrateDimensions({ mode: 'diagnose' });
        expect(result.imagesChecked).toBe(0);
    });

    test('accepts valid fix mode', async () => {
        mockDocClient.on(QueryCommand).resolves({ Items: [] });

        const result = await migrateDimensions({ mode: 'fix' });
        expect(result.imagesChecked).toBe(0);
    });
});

describe('migrateDimensions single image mode', () => {
    const mockImage: ImageItem = {
        parentPath: '/2024/01-15/',
        itemName: 'photo.jpg',
        itemType: 'image',
        versionId: 'v1',
        dimensions: { width: 300, height: 225 },
    };

    test('processes single image when specified', async () => {
        const imageBuffer = loadTestImage('FullMetadata.jpg');

        mockDocClient.on(QueryCommand).resolves({ Items: [mockImage] });
        mockS3Client.on(GetObjectCommand).resolves(createMockS3Response(imageBuffer, 'v1'));

        const result = await migrateDimensions({
            mode: 'diagnose',
            image: '/2024/01-15/photo.jpg',
        });

        expect(result.imagesChecked).toBe(1);
        expect(result.albumsChecked).toBe(1);
    });

    test('returns error if single image not found in DynamoDB', async () => {
        mockDocClient.on(QueryCommand).resolves({ Items: [] });

        const result = await migrateDimensions({
            mode: 'diagnose',
            image: '/2024/01-15/photo.jpg',
        });

        expect(result.error).toBe('Image not found in DynamoDB: /2024/01-15/photo.jpg');
        expect(result.stoppedEarly).toBe(true);
    });
});

describe('migrateDimensions diagnose mode', () => {
    const mockYearAlbum: AlbumItem = {
        parentPath: '/',
        itemName: '2024',
        itemType: 'album',
    };

    const mockDayAlbum: AlbumItem = {
        parentPath: '/2024/',
        itemName: '01-15',
        itemType: 'album',
    };

    const mockImage: ImageItem = {
        parentPath: '/2024/01-15/',
        itemName: 'photo.jpg',
        itemType: 'image',
        versionId: 'v1',
        dimensions: { width: 300, height: 225 },
    };

    test('reports issues without writing in diagnose mode', async () => {
        const imageBuffer = loadTestImage('FullMetadata.jpg');

        // Mock different dimensions in DynamoDB vs S3
        const wrongDimensionsImage: ImageItem = {
            ...mockImage,
            dimensions: { width: 100, height: 100 }, // Wrong!
        };

        mockDocClient
            .on(QueryCommand, {
                KeyConditionExpression: 'parentPath = :parentPath',
                ExpressionAttributeValues: { ':parentPath': '/' },
            })
            .resolves({ Items: [mockYearAlbum] })
            .on(QueryCommand, {
                KeyConditionExpression: 'parentPath = :parentPath',
                ExpressionAttributeValues: { ':parentPath': '/2024/' },
            })
            .resolves({ Items: [mockDayAlbum] })
            .on(QueryCommand, {
                KeyConditionExpression: 'parentPath = :parentPath',
                ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' },
            })
            .resolves({ Items: [wrongDimensionsImage] });

        mockS3Client.on(GetObjectCommand).resolves(createMockS3Response(imageBuffer, 'v1'));

        const result = await migrateDimensions({ mode: 'diagnose' });

        expect(result.imagesChecked).toBe(1);
        expect(result.issuesFound).toBeGreaterThan(0);
        expect(result.issuesFixed).toBe(0); // Diagnose mode doesn't fix

        // Verify no UpdateCommand was sent
        const updateCalls = mockDocClient.commandCalls(UpdateCommand);
        expect(updateCalls).toHaveLength(0);
    });
});

describe('migrateDimensions fix mode', () => {
    test('fixes orientation dimension issues in fix mode', async () => {
        // Use the portrait orientation test image (orientation 6)
        const imageBuffer = loadTestImage('orientation/PortraitOrientation6.jpg');

        const mockYearAlbum: AlbumItem = { parentPath: '/', itemName: '2024', itemType: 'album' };
        const mockDayAlbum: AlbumItem = { parentPath: '/2024/', itemName: '01-15', itemType: 'album' };

        // Image has wrong dimensions (not swapped for orientation)
        const imageWithWrongDimensions: ImageItem = {
            parentPath: '/2024/01-15/',
            itemName: 'portrait.jpg',
            itemType: 'image',
            versionId: 'v1',
            dimensions: { width: 800, height: 600 }, // Wrong - should be 600x800 after orientation
        };

        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: [mockYearAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/' } })
            .resolves({ Items: [mockDayAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' } })
            .resolves({ Items: [imageWithWrongDimensions] })
            .on(UpdateCommand)
            .resolves({});

        mockS3Client.on(GetObjectCommand).resolves(createMockS3Response(imageBuffer, 'v1'));

        const result = await migrateDimensions({ mode: 'fix' });

        expect(result.imagesChecked).toBe(1);
        expect(result.issuesFound).toBeGreaterThanOrEqual(1);
        expect(result.issuesFixed).toBeGreaterThanOrEqual(1);

        // Verify UpdateCommand was called with correct dimensions
        const updateCalls = mockDocClient.commandCalls(UpdateCommand);
        expect(updateCalls.length).toBeGreaterThan(0);

        const updateInput = updateCalls[0].args[0].input;
        expect(updateInput.ExpressionAttributeValues?.[':dimensions']).toEqual({
            width: 600,
            height: 800,
        });
    });
});

describe('migrateDimensions idempotency', () => {
    test('skips images with correct dimensions', async () => {
        const imageBuffer = loadTestImage('FullMetadata.jpg');

        // FullMetadata.jpg is 300x225 with orientation 1
        const mockYearAlbum: AlbumItem = { parentPath: '/', itemName: '2024', itemType: 'album' };
        const mockDayAlbum: AlbumItem = { parentPath: '/2024/', itemName: '01-15', itemType: 'album' };
        const correctImage: ImageItem = {
            parentPath: '/2024/01-15/',
            itemName: 'photo.jpg',
            itemType: 'image',
            versionId: 'v1',
            dimensions: { width: 300, height: 225 }, // Correct dimensions
        };

        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: [mockYearAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/' } })
            .resolves({ Items: [mockDayAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' } })
            .resolves({ Items: [correctImage] });

        mockS3Client.on(GetObjectCommand).resolves(createMockS3Response(imageBuffer, 'v1'));

        const result = await migrateDimensions({ mode: 'fix' });

        expect(result.imagesChecked).toBe(1);
        // No dimension issues should be found
        const dimensionIssues = result.issues.filter(
            (i) => i.type === 'dimensionsOrientation' || i.type === 'dimensionsOther',
        );
        expect(dimensionIssues).toHaveLength(0);

        // No updates should have been made
        const updateCalls = mockDocClient.commandCalls(UpdateCommand);
        expect(updateCalls).toHaveLength(0);
    });
});

describe('migrateDimensions orientation logic', () => {
    test('swaps dimensions only for orientation 5-8', async () => {
        // Use orientation 6 test image
        const imageBuffer = loadTestImage('orientation/PortraitOrientation6.jpg');

        const mockYearAlbum: AlbumItem = { parentPath: '/', itemName: '2024', itemType: 'album' };
        const mockDayAlbum: AlbumItem = { parentPath: '/2024/', itemName: '01-15', itemType: 'album' };

        // DynamoDB has raw pixel dimensions (not orientation-corrected)
        const imageWithRawDimensions: ImageItem = {
            parentPath: '/2024/01-15/',
            itemName: 'portrait.jpg',
            itemType: 'image',
            versionId: 'v1',
            dimensions: { width: 800, height: 600 }, // Raw pixels
        };

        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: [mockYearAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/' } })
            .resolves({ Items: [mockDayAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' } })
            .resolves({ Items: [imageWithRawDimensions] })
            .on(UpdateCommand)
            .resolves({});

        mockS3Client.on(GetObjectCommand).resolves(createMockS3Response(imageBuffer, 'v1'));

        const result = await migrateDimensions({ mode: 'fix' });

        // Should detect orientation issue and fix it
        const orientationIssues = result.issues.filter((i) => i.type === 'dimensionsOrientation');
        expect(orientationIssues.length).toBeGreaterThan(0);
        expect(orientationIssues[0].fixed).toBe(true);
    });

    test('does not swap for orientation 1 (normal)', async () => {
        // Use a normal orientation image
        const imageBuffer = loadTestImage('FullMetadata.jpg');

        const mockYearAlbum: AlbumItem = { parentPath: '/', itemName: '2024', itemType: 'album' };
        const mockDayAlbum: AlbumItem = { parentPath: '/2024/', itemName: '01-15', itemType: 'album' };

        // FullMetadata.jpg is 300x225 with orientation 1
        const correctImage: ImageItem = {
            parentPath: '/2024/01-15/',
            itemName: 'photo.jpg',
            itemType: 'image',
            versionId: 'v1',
            dimensions: { width: 300, height: 225 },
        };

        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: [mockYearAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/' } })
            .resolves({ Items: [mockDayAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' } })
            .resolves({ Items: [correctImage] });

        mockS3Client.on(GetObjectCommand).resolves(createMockS3Response(imageBuffer, 'v1'));

        const result = await migrateDimensions({ mode: 'fix' });

        // No orientation issues should be detected
        const orientationIssues = result.issues.filter((i) => i.type === 'dimensionsOrientation');
        expect(orientationIssues).toHaveLength(0);
    });
});

describe('migrateDimensions validation checks', () => {
    test('detects missing S3 image', async () => {
        const mockYearAlbum: AlbumItem = { parentPath: '/', itemName: '2024', itemType: 'album' };
        const mockDayAlbum: AlbumItem = { parentPath: '/2024/', itemName: '01-15', itemType: 'album' };
        const mockImage: ImageItem = {
            parentPath: '/2024/01-15/',
            itemName: 'missing.jpg',
            itemType: 'image',
            versionId: 'v1',
            dimensions: { width: 100, height: 100 },
        };

        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: [mockYearAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/' } })
            .resolves({ Items: [mockDayAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' } })
            .resolves({ Items: [mockImage] });

        const noSuchKeyError = new Error('NoSuchKey');
        noSuchKeyError.name = 'NoSuchKey';
        mockS3Client.on(GetObjectCommand).rejects(noSuchKeyError);

        const result = await migrateDimensions({ mode: 'diagnose' });

        expect(result.imagesChecked).toBe(1);
        const missingIssues = result.issues.filter((i) => i.type === 'missingFromS3');
        expect(missingIssues).toHaveLength(1);
    });

    test('detects invalid versionId', async () => {
        const mockYearAlbum: AlbumItem = { parentPath: '/', itemName: '2024', itemType: 'album' };
        const mockDayAlbum: AlbumItem = { parentPath: '/2024/', itemName: '01-15', itemType: 'album' };
        const mockImage: ImageItem = {
            parentPath: '/2024/01-15/',
            itemName: 'photo.jpg',
            itemType: 'image',
            versionId: 'old-version-that-doesnt-exist',
            dimensions: { width: 100, height: 100 },
        };

        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: [mockYearAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/' } })
            .resolves({ Items: [mockDayAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' } })
            .resolves({ Items: [mockImage] });

        const noSuchVersionError = new Error('NoSuchVersion');
        noSuchVersionError.name = 'NoSuchVersion';
        mockS3Client.on(GetObjectCommand).rejects(noSuchVersionError);

        const result = await migrateDimensions({ mode: 'diagnose' });

        const versionIssues = result.issues.filter((i) => i.type === 'versionIdInvalid');
        expect(versionIssues).toHaveLength(1);
    });
});

describe('migrateDimensions fail-fast', () => {
    test('stops after 20 non-orientation issues', async () => {
        const mockYearAlbum: AlbumItem = { parentPath: '/', itemName: '2024', itemType: 'album' };
        const mockDayAlbum: AlbumItem = { parentPath: '/2024/', itemName: '01-15', itemType: 'album' };

        // Create 25 images that will all be missing from S3
        const images: ImageItem[] = Array.from({ length: 25 }, (_, i) => ({
            parentPath: '/2024/01-15/',
            itemName: `photo${i.toString().padStart(2, '0')}.jpg`,
            itemType: 'image' as const,
            versionId: 'v1',
            dimensions: { width: 100, height: 100 },
        }));

        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: [mockYearAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/' } })
            .resolves({ Items: [mockDayAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' } })
            .resolves({ Items: images });

        const noSuchKeyError = new Error('NoSuchKey');
        noSuchKeyError.name = 'NoSuchKey';
        mockS3Client.on(GetObjectCommand).rejects(noSuchKeyError);

        const result = await migrateDimensions({ mode: 'diagnose' });

        expect(result.stoppedEarly).toBe(true);
        expect(result.startFrom).toBeDefined();
        // Should have stopped at or around 20 issues (might be slightly more due to chunking)
        expect(result.issues.length).toBeGreaterThanOrEqual(20);
        expect(result.issues.length).toBeLessThanOrEqual(30); // Allow for chunk completion
    });

    test('returns correct startFrom path on fail-fast', async () => {
        const mockYearAlbum: AlbumItem = { parentPath: '/', itemName: '2024', itemType: 'album' };
        const mockDayAlbum: AlbumItem = { parentPath: '/2024/', itemName: '01-15', itemType: 'album' };

        // Create images with predictable names
        const images: ImageItem[] = Array.from({ length: 25 }, (_, i) => ({
            parentPath: '/2024/01-15/',
            itemName: `photo${i.toString().padStart(2, '0')}.jpg`,
            itemType: 'image' as const,
            versionId: 'v1',
            dimensions: { width: 100, height: 100 },
        }));

        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: [mockYearAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/' } })
            .resolves({ Items: [mockDayAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' } })
            .resolves({ Items: images });

        const noSuchKeyError = new Error('NoSuchKey');
        noSuchKeyError.name = 'NoSuchKey';
        mockS3Client.on(GetObjectCommand).rejects(noSuchKeyError);

        const result = await migrateDimensions({ mode: 'diagnose' });

        expect(result.startFrom).toMatch(/^\/2024\/01-15\/photo\d+\.jpg$/);
    });
});

describe('migrateDimensions resume from image', () => {
    test('startFrom skips newer albums and earlier images', async () => {
        const mockYearAlbums: AlbumItem[] = [
            { parentPath: '/', itemName: '2024', itemType: 'album' },
            { parentPath: '/', itemName: '2023', itemType: 'album' },
        ];
        const mockDayAlbums2024: AlbumItem[] = [
            { parentPath: '/2024/', itemName: '06-15', itemType: 'album' },
            { parentPath: '/2024/', itemName: '01-15', itemType: 'album' },
        ];
        const mockImages: ImageItem[] = [
            {
                parentPath: '/2024/01-15/',
                itemName: 'aaa.jpg',
                itemType: 'image',
                versionId: 'v1',
                dimensions: { width: 300, height: 225 },
            },
            {
                parentPath: '/2024/01-15/',
                itemName: 'bbb.jpg',
                itemType: 'image',
                versionId: 'v1',
                dimensions: { width: 300, height: 225 },
            },
            {
                parentPath: '/2024/01-15/',
                itemName: 'ccc.jpg',
                itemType: 'image',
                versionId: 'v1',
                dimensions: { width: 300, height: 225 },
            },
        ];

        const imageBuffer = loadTestImage('FullMetadata.jpg');

        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: mockYearAlbums })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/' } })
            .resolves({ Items: mockDayAlbums2024 })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2023/' } })
            .resolves({ Items: [] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/06-15/' } })
            .resolves({ Items: [] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' } })
            .resolves({ Items: mockImages });

        mockS3Client.on(GetObjectCommand).resolves(createMockS3Response(imageBuffer, 'v1'));

        // Resume from bbb.jpg - should skip aaa.jpg
        const result = await migrateDimensions({
            mode: 'diagnose',
            startFrom: '/2024/01-15/bbb.jpg',
        });

        // Should only process bbb.jpg and ccc.jpg (skips aaa.jpg which is earlier alphabetically)
        // Also skips 2024/06-15 (newer than startFrom's album)
        expect(result.imagesChecked).toBe(2);
    });
});

describe('migrateDimensions result structure', () => {
    test('includes resumption path on any stop', async () => {
        mockDocClient.on(QueryCommand).resolves({ Items: [] });

        const result = await migrateDimensions({ mode: 'diagnose' });

        expect(result).toHaveProperty('imagesChecked');
        expect(result).toHaveProperty('albumsChecked');
        expect(result).toHaveProperty('issuesFound');
        expect(result).toHaveProperty('issuesFixed');
        expect(result).toHaveProperty('issues');
        expect(result).toHaveProperty('stoppedEarly');
        expect(result).toHaveProperty('durationMs');
        expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
});

describe('migrateDimensions versionId handling', () => {
    test('skips versionId check if DynamoDB versionId is empty', async () => {
        const imageBuffer = loadTestImage('FullMetadata.jpg');

        const mockYearAlbum: AlbumItem = { parentPath: '/', itemName: '2024', itemType: 'album' };
        const mockDayAlbum: AlbumItem = { parentPath: '/2024/', itemName: '01-15', itemType: 'album' };

        // Image without versionId but with correct dimensions
        const imageWithoutVersionId: ImageItem = {
            parentPath: '/2024/01-15/',
            itemName: 'photo.jpg',
            itemType: 'image',
            versionId: '', // Empty
            dimensions: { width: 300, height: 225 },
        };

        mockDocClient
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/' } })
            .resolves({ Items: [mockYearAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/' } })
            .resolves({ Items: [mockDayAlbum] })
            .on(QueryCommand, { ExpressionAttributeValues: { ':parentPath': '/2024/01-15/' } })
            .resolves({ Items: [imageWithoutVersionId] });

        mockS3Client.on(GetObjectCommand).resolves(createMockS3Response(imageBuffer, 'some-version'));

        const result = await migrateDimensions({ mode: 'diagnose' });

        // Should not report versionId mismatch when DynamoDB has no versionId
        const versionIssues = result.issues.filter((i) => i.type === 'versionIdInvalid');
        expect(versionIssues).toHaveLength(0);
    });
});
