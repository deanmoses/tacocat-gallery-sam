import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import path from 'path';
import { selectMetadata } from './extractImageMetadata';
import ExifReader from 'exifreader';
import { existsSync } from 'fs';

const mockDocClient = mockClient(DynamoDBDocumentClient);

afterEach(() => {
    mockDocClient.reset();
});

describe('selectMetadata', () => {
    const images = [
        {
            fileName: 'FullMetadata.jpg',
            title: 'My Image Title',
            description: 'My image description',
            tags: ['halloween', 'dog', 'parade'],
            dimensions: { height: 225, width: 300 },
        },
        {
            fileName: 'NoDescription.jpg',
            title: 'Taylor Swift',
            description: undefined,
            tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
            dimensions: { height: 212, width: 220 },
        },
        {
            fileName: 'NoTitle.jpg',
            title: 'Taylor Swift', // Will get title from Headline
            description: "Portriat from the cover of Taylor's Lover album",
            tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
            dimensions: { height: 212, width: 220 },
        },
        {
            fileName: 'NoHeadline.jpg',
            title: 'Taylor Swift', // Will get title from Title
            description: "Portriat from the cover of Taylor's Lover album",
            tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
            dimensions: { height: 212, width: 220 },
        },
        {
            fileName: 'NoTitleOrHeadline.jpg',
            title: undefined, // No Title or Headline means no title
            description: "Portriat from the cover of Taylor's Lover album",
            tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
            dimensions: { height: 212, width: 220 },
        },
        {
            fileName: 'NoTags.jpg',
            title: 'Taylor Swift',
            description: "Portriat from the cover of Taylor's Lover album",
            tags: undefined,
            dimensions: { height: 212, width: 220 },
        },
    ];
    images.forEach((image) => {
        test(`File [${image.fileName}]`, async () => {
            const filePath = path.resolve(__dirname, '..', '..', 'test/data/images/', image.fileName);
            if (!existsSync(filePath)) throw new Error(`File [${filePath}] does not exist`);
            const tags = await ExifReader.load(filePath, { expanded: true, async: true });
            const md = selectMetadata(tags);
            expect(md.title).toBe(image.title);
            expect(md.description).toBe(image.description);
            expect(md.tags).toEqual(image.tags);
            expect(md.dimensions).toEqual(image.dimensions);
        });
    });
});

describe('process png', () => {
    test('png', async () => {
        const filePath = path.resolve(__dirname, '..', '..', 'test/data/images/pngFormat.png');
        if (!existsSync(filePath)) throw new Error(`File [${filePath}] does not exist`);
        const tags = await ExifReader.load(filePath, { expanded: true, async: true });
        console.dir(tags, { depth: null });
        const md = selectMetadata(tags);
        expect(md.dimensions).toEqual({ height: 212, width: 220 });
    });
    test('windows png', async () => {
        const filePath = path.resolve(__dirname, '..', '..', 'test/data/images/pngWindows.png');
        if (!existsSync(filePath)) throw new Error(`File [${filePath}] does not exist`);
        const tags = await ExifReader.load(filePath, { expanded: true, async: true });
        console.dir(tags, { depth: null });
        const md = selectMetadata(tags);
        expect(md.dimensions).toEqual({ height: 843, width: 1500 });
    });
});

describe('process gif', () => {
    test('gif', async () => {
        const filePath = path.resolve(__dirname, '..', '..', 'test/data/images/gifFormat.gif');
        if (!existsSync(filePath)) throw new Error(`File [${filePath}] does not exist`);
        const tags = await ExifReader.load(filePath, { expanded: true, async: true });
        console.dir(tags, { depth: null });
        const md = selectMetadata(tags);
        expect(md.dimensions).toEqual({ height: 240, width: 360 });
    });
});

describe('process heic (XMP metadata)', () => {
    test('FullMetadataHeic.heic', async () => {
        const filePath = path.resolve(__dirname, '..', '..', 'test/data/images/FullMetadataHeic.heic');
        if (!existsSync(filePath)) throw new Error(`File [${filePath}] does not exist`);
        // HEIC requires async: true for full metadata parsing
        const tags = await ExifReader.load(filePath, { expanded: true, async: true });
        const md = selectMetadata(tags);
        expect(md.title).toBe('Test Image Title');
        expect(md.description).toBe('Test description');
        expect(md.tags).toEqual(['test1', 'test2', 'test3']);
        expect(md.dimensions).toEqual({ height: 3024, width: 4032 });
    });

    test('NoDescriptionOrKeywordsOrCopyrightHeic.heic', async () => {
        const filePath = path.resolve(
            __dirname,
            '..',
            '..',
            'test/data/images/NoDescriptionOrKeywordsOrCopyrightHeic.heic',
        );
        if (!existsSync(filePath)) throw new Error(`File [${filePath}] does not exist`);
        // HEIC requires async: true for full metadata parsing
        const tags = await ExifReader.load(filePath, { expanded: true, async: true });
        const md = selectMetadata(tags);
        expect(md.title).toBe('Test Image Title');
        expect(md.description).toBeUndefined();
        expect(md.tags).toBeUndefined();
        expect(md.dimensions).toEqual({ height: 3024, width: 4032 });
    });
});
