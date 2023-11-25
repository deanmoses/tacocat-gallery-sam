import path from 'path';
import { selectMetadata } from './extractImageMetadata';
import ExifReader from 'exifreader';

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
            const tags = await ExifReader.load(filePath, { expanded: true });
            const md = selectMetadata(tags);
            expect(md.title).toBe(image.title);
            expect(md.description).toBe(image.description);
            expect(md.tags).toEqual(image.tags);
            expect(md.dimensions).toEqual(image.dimensions);
        });
    });
});
