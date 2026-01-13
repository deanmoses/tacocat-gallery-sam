import ExifReader from 'exifreader';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { findImage } from '../../lib/gallery_client/AlbumObject';
import { getParentFromPath, isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { assertDynamoDBItemDoesNotExist, cleanUpAlbum } from './helpers/albumHelpers';
import { reallyGetNameFromPath } from './helpers/pathHelpers';
import {
    assertOriginalImageDoesNotExist,
    downloadOriginalImage,
    originalImageExists,
    uploadImage,
} from './helpers/s3ImageHelper';

const yearPath = '/1712/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}09-03/`;
const heicImagePath = `${albumPath}heictest.heic`;
const jpegImagePath = `${albumPath}heictest.jpg`; // HEIC converts to this

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);

    await Promise.all([
        assertDynamoDBItemDoesNotExist(yearPath),
        assertDynamoDBItemDoesNotExist(albumPath),
        assertOriginalImageDoesNotExist(heicImagePath),
        assertOriginalImageDoesNotExist(jpegImagePath),
    ]);

    // Upload HEIC file - Lambda will convert to JPEG
    await uploadImage('FullMetadataHeic.heic', heicImagePath);
    // Wait for HEIC conversion + JPEG processing (two Lambda triggers)
    await new Promise((r) => setTimeout(r, 8000));

    await updateAlbum(getParentFromPath(albumPath), { published: true });
    await updateAlbum(albumPath, { published: true });
}, 30000);

afterAll(async () => {
    await cleanUpAlbum(albumPath);
    await cleanUpAlbum(yearPath);
});

test('Parent album was created', async () => {
    if (!(await itemExists(albumPath))) throw new Error(`Album [${albumPath}] does not exist`);
});

test('Original HEIC was deleted from S3', async () => {
    if (await originalImageExists(heicImagePath)) {
        throw new Error(`HEIC [${heicImagePath}] should have been deleted after conversion`);
    }
});

test('Converted JPEG exists in S3', async () => {
    if (!(await originalImageExists(jpegImagePath))) {
        throw new Error(`Converted JPEG [${jpegImagePath}] should exist in S3`);
    }
});

test('DynamoDB entry exists with correct path', async () => {
    expect(isValidImagePath(jpegImagePath)).toBe(true);
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error('Album not found');
    const imageName = reallyGetNameFromPath(jpegImagePath);
    const image = findImage(album, imageName);
    if (!image) throw new Error(`Image [${imageName}] not found in album`);
    expect(image.parentPath).toBe(albumPath);
    expect(image.itemName).toBe(imageName);
});

test('Dimensions were preserved through conversion', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error('Album not found');
    const imageName = reallyGetNameFromPath(jpegImagePath);
    const image = findImage(album, imageName);
    if (!image) throw new Error(`Image [${imageName}] not found in album`);

    // FullMetadataHeic.heic is 4032x3024
    expect(image.dimensions).toEqual({ width: 4032, height: 3024 });
});

test('XMP metadata was preserved through conversion', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error('Album not found');
    const imageName = reallyGetNameFromPath(jpegImagePath);
    const image = findImage(album, imageName);
    if (!image) throw new Error(`Image [${imageName}] not found in album`);

    // These values are from FullMetadataHeic.heic's XMP metadata
    expect(image.title).toBe('Test Image Title');
    expect(image.description).toBe('Test description');
    expect(image.tags?.sort()).toEqual(['test1', 'test2', 'test3'].sort());
});

test('Image has versionId from converted JPEG', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error('Album not found');
    const imageName = reallyGetNameFromPath(jpegImagePath);
    const image = findImage(album, imageName);
    if (!image) throw new Error(`Image [${imageName}] not found in album`);
    expect(image.versionId).toBeDefined();
    expect(image.versionId).not.toBe('');
});

test('Converted JPEG file contains all metadata from original HEIC', async () => {
    // Download the converted JPEG from S3 and verify ALL metadata is preserved.
    // This ensures the JPEG can act as an archival "original" with full metadata
    // for use in Google Photos, Apple Photos, etc.
    const jpegBuffer = await downloadOriginalImage(jpegImagePath);
    const tags = await ExifReader.load(jpegBuffer, { expanded: true, async: true });

    // === IPTC Core fields (from Adobe Bridge) ===

    // Headline (XMP Headline or IPTC Headline)
    const headline = tags.xmp?.Headline?.description || tags.iptc?.Headline?.description;
    expect(headline).toBe('Test Image Headline');

    // Title (XMP title or IPTC Object Name)
    const title = tags.xmp?.title?.description || tags.iptc?.['Object Name']?.description;
    expect(title).toBe('Test Image Title');

    // Description (XMP description or IPTC Caption/Abstract or EXIF ImageDescription)
    const description =
        tags.xmp?.description?.description ||
        tags.iptc?.['Caption/Abstract']?.description ||
        tags.exif?.ImageDescription?.description;
    expect(description).toBe('Test description');

    // Keywords (XMP subject or IPTC Keywords)
    const xmpSubject = tags.xmp?.subject?.value;
    const iptcKeywords = tags.iptc?.Keywords;
    let keywords: string[];
    if (Array.isArray(xmpSubject) && xmpSubject.length > 0) {
        keywords = xmpSubject.map((item: { description: string }) => item.description);
    } else if (Array.isArray(iptcKeywords) && iptcKeywords.length > 0) {
        keywords = iptcKeywords.map((item) => item.description);
    } else {
        throw new Error('No keywords found in XMP subject or IPTC Keywords');
    }
    expect(keywords.sort()).toEqual(['test1', 'test2', 'test3'].sort());

    // Date Created (XMP DateCreated)
    const dateCreated = tags.xmp?.DateCreated?.description;
    expect(dateCreated).toMatch(/^2026-01-08/); // 1/8/26

    // City (XMP City)
    const city = tags.xmp?.City?.description;
    expect(city).toBe('Anytown');

    // State/Province (XMP State)
    const state = tags.xmp?.State?.description;
    expect(state).toBe('NY');

    // Country (XMP Country)
    const country = tags.xmp?.Country?.description;
    expect(country).toBe('USA');

    // ISO Country Code (XMP CountryCode)
    const countryCode = tags.xmp?.CountryCode?.description;
    expect(countryCode).toBe('USA');

    // Copyright Notice (XMP rights or EXIF Copyright)
    const copyright = tags.xmp?.rights?.description || tags.exif?.Copyright?.description;
    expect(copyright).toContain('© 2026 Dean and Lucie Moses, all rights reserved');

    // Copyright Status (XMP Marked - true means copyrighted)
    const copyrightStatus = tags.xmp?.Marked?.description;
    expect(copyrightStatus).toBe('True');

    // Rights Usage Terms (XMP UsageTerms)
    const usageTerms = tags.xmp?.UsageTerms?.description;
    expect(usageTerms).toContain('All rights reserved');

    // === Camera Data (EXIF) ===

    // Date Time Original
    expect(tags.exif?.DateTimeOriginal?.description).toMatch(/^2026:01:08/);

    // Make
    expect(tags.exif?.Make?.description).toBe('Apple');

    // Model
    expect(tags.exif?.Model?.description).toBe('iPhone 17 Pro');

    // === GPS ===
    expect(tags.gps).toBeDefined();
    expect(tags.gps?.Latitude).toBeCloseTo(37.872, 2);
    expect(tags.gps?.Longitude).toBeCloseTo(-122.272, 2);

    // === Dimensions ===
    const width = tags.exif?.PixelXDimension?.value || tags.file?.['Image Width']?.value;
    const height = tags.exif?.PixelYDimension?.value || tags.file?.['Image Height']?.value;
    expect(width).toBe(4032);
    expect(height).toBe(3024);
});
