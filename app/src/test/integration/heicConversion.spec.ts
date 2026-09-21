import ExifReader from 'exifreader';
import { ImageItem, VideoItem } from '../../lib/gallery/galleryTypes';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { cleanUpYear, getMediaOrFail, publishAlbumAndYear, waitForMediaItem } from './helpers/fixtures';
import { downloadOriginal, originalExists, uploadMedia, waitForOriginalDeleted } from './helpers/s3';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.heicConversion;
const albumPath = `${yearPath}09-03/`;
const heicPath = `${albumPath}heictest.heic`;
const jpegPath = `${albumPath}heictest.jpg`;
let image: ImageItem | VideoItem;

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await uploadMedia('images/FullMetadataHeic.heic', heicPath);
    // Two Lambda hops: the HEIC upload converts and uploads a JPEG, and that upload writes the item
    await waitForMediaItem(jpegPath, 40_000);
    await waitForOriginalDeleted(heicPath);
    await publishAlbumAndYear(albumPath);
    image = await getMediaOrFail(jpegPath);
});

afterAll(() => cleanUpYear(yearPath));

describe('after uploading a HEIC', () => {
    it('the album was created', async () => {
        await expect(itemExists(albumPath)).resolves.toBe(true);
    });

    it('the originals bucket holds the converted JPEG', async () => {
        await expect(originalExists(jpegPath)).resolves.toBe(true);
    });

    it('the item is stored under the JPEG path with the JPEG version', () => {
        expect(image.parentPath).toBe(albumPath);
        expect(image.itemName).toBe('heictest.jpg');
        expect(image.versionId).toBeTruthy();
    });

    it('the dimensions survived conversion', () => {
        expect(image.dimensions).toStrictEqual({ width: 4032, height: 3024 });
    });

    it('the XMP metadata survived conversion', () => {
        expect(image.title).toBe('Test Image Title');
        expect(image.description).toBe('Test description');
        expect(image.tags?.sort()).toStrictEqual(['test1', 'test2', 'test3']);
    });

    it('the JPEG file itself carries all the metadata of the HEIC', async () => {
        // The JPEG stands in for the original in Google Photos, Apple Photos and the like,
        // so everything Adobe Bridge wrote to the HEIC has to be in the file, not just in DynamoDB
        const tags = await ExifReader.load(await downloadOriginal(jpegPath), { expanded: true, async: true });

        // IPTC Core
        expect(tags.xmp?.Headline?.description ?? tags.iptc?.Headline?.description).toBe('Test Image Headline');
        expect(tags.xmp?.title?.description ?? tags.iptc?.['Object Name']?.description).toBe('Test Image Title');
        expect(
            tags.xmp?.description?.description ??
                tags.iptc?.['Caption/Abstract']?.description ??
                tags.exif?.ImageDescription?.description,
        ).toBe('Test description');

        const xmpSubject = tags.xmp?.subject?.value;
        const iptcKeywords = tags.iptc?.Keywords;
        const keywords = Array.isArray(xmpSubject)
            ? xmpSubject.map((item: { description: string }) => item.description)
            : Array.isArray(iptcKeywords)
              ? iptcKeywords.map((item) => item.description)
              : [];

        expect(keywords.sort()).toStrictEqual(['test1', 'test2', 'test3']);
        expect(tags.xmp?.DateCreated?.description).toMatch(/^2026-01-08/);
        expect(tags.xmp?.City?.description).toBe('Anytown');
        expect(tags.xmp?.State?.description).toBe('NY');
        expect(tags.xmp?.Country?.description).toBe('USA');
        expect(tags.xmp?.CountryCode?.description).toBe('USA');
        expect(tags.xmp?.rights?.description ?? tags.exif?.Copyright?.description).toContain(
            '© 2026 Dean and Lucie Moses, all rights reserved',
        );
        expect(tags.xmp?.Marked?.description).toBe('True');
        expect(tags.xmp?.UsageTerms?.description).toContain('All rights reserved');

        // EXIF camera data
        expect(tags.exif?.DateTimeOriginal?.description).toMatch(/^2026:01:08/);
        expect(tags.exif?.Make?.description).toBe('Apple');
        expect(tags.exif?.Model?.description).toBe('iPhone 17 Pro');

        // GPS
        expect(tags.gps?.Latitude).toBeCloseTo(37.872, 2);
        expect(tags.gps?.Longitude).toBeCloseTo(-122.272, 2);

        // Dimensions
        expect(tags.exif?.PixelXDimension?.value ?? tags.file?.['Image Width']?.value).toBe(4032);
        expect(tags.exif?.PixelYDimension?.value ?? tags.file?.['Image Height']?.value).toBe(3024);
    });
});
