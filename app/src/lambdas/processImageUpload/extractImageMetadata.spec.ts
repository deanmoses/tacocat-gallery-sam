import path from 'path';
import { selectMetadata } from './extractImageMetadata';
import ExifReader from 'exifreader';

test.todo('extract metadata from png');
test.todo('extract metadata from gif');
test.todo('extract metadata from heic');

describe('selectMetadata', () => {
    const images = [
        {
            fileName: 'FullMetadata.jpg',
            title: 'My Image Title',
            description: 'My image description',
            tags: ['halloween', 'dog', 'parade'],
        },
        {
            fileName: 'NoDescription.jpg',
            title: 'Taylor Swift',
            description: undefined,
            tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
        },
        {
            fileName: 'NoTitle.jpg',
            title: 'Taylor Swift', // WIll get title from Headline
            description: "Portriat from the cover of Taylor's Lover album",
            tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
        },
        {
            fileName: 'NoHeadline.jpg',
            title: 'Taylor Swift', // Will get title from Title
            description: "Portriat from the cover of Taylor's Lover album",
            tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
        },
        {
            fileName: 'NoTitleOrHeadline.jpg',
            title: undefined, // No Title or Headline means no title
            description: "Portriat from the cover of Taylor's Lover album",
            tags: ['Taylor', 'Swift', 'TSwift', 'rock', 'star', 'album', 'cover'],
        },
        {
            fileName: 'NoTags.jpg',
            title: 'Taylor Swift',
            description: "Portriat from the cover of Taylor's Lover album",
            tags: undefined,
        },
    ];
    images.forEach((image) => {
        test(`File [${image.fileName}]`, async () => {
            const filePath = path.resolve(__dirname, '..', '..', 'test/data/images/', image.fileName);
            const tags = await ExifReader.load(filePath, { expanded: true });
            const album = selectMetadata(tags);
            expect(album.title).toBe(image.title);
            expect(album.description).toBe(image.description);
            expect(album.tags).toEqual(image.tags);
        });
    });
});
