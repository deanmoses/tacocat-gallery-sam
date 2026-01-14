import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import ExifReader from 'exifreader';
import { Readable } from 'stream';
import { ImageCreateRequest } from '../../lib/gallery/galleryTypes';

/**
 * Error thrown when ExifReader fails to extract metadata from an image.
 * Used to distinguish file processing errors (which should quarantine)
 * from infrastructure errors like S3 (which should propagate for retry).
 */
export class MetadataExtractionError extends Error {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = 'MetadataExtractionError';
        this.cause = cause;
    }
}

export async function extractImageMetadata(bucket: string, objectKey: string): Promise<Partial<ImageCreateRequest>> {
    const s3Command = new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
    });
    const client = new S3Client({});
    const response = await client.send(s3Command);
    // TODO: download this async, because you don't need to download
    // the full image to read the metadata.
    //
    // Unfortunately, exifreader doesn't support passing in a stream,
    // so I could change this to have *it* download the file, which it
    // will do async.
    //
    //const tags = await ExifReader.load(urlToS3Object);
    const stream = response.Body as Readable;
    const fileContents = Buffer.concat(await stream.toArray());

    // Wrap only ExifReader call - S3 errors should propagate for Lambda retry
    let tags: ExifReader.ExpandedTags;
    try {
        tags = await ExifReader.load(fileContents, { async: true, expanded: true });
    } catch (error) {
        throw new MetadataExtractionError(`Failed to extract metadata from: ${objectKey}`, error);
    }

    return selectMetadata(tags);
}

/**
 * Extract the metadata to be saved to DynamoDB.
 * Checks IPTC first (JPEG), then falls back to XMP (HEIC and some JPEGs).
 */
export function selectMetadata(tags: ExifReader.ExpandedTags): Partial<ImageCreateRequest> {
    // Use || undefined to convert empty strings to undefined (XMP can have empty description tags)
    const image: Partial<ImageCreateRequest> = {
        title:
            tags.iptc?.['Object Name']?.description ||
            tags.iptc?.['Headline']?.description ||
            tags.xmp?.title?.description ||
            tags.xmp?.Headline?.description ||
            undefined,
        description: tags.iptc?.['Caption/Abstract']?.description || tags.xmp?.description?.description || undefined,
    };
    const height =
        tags.file?.['Image Height']?.description ||
        tags.exif?.ImageLength?.description ||
        tags.exif?.PixelYDimension?.description ||
        tags.pngFile?.['Image Height']?.description ||
        tags.gif?.['Image Height']?.description;
    const width =
        tags.file?.['Image Width']?.description ||
        tags.exif?.ImageWidth?.description ||
        tags.exif?.PixelXDimension?.description ||
        tags.pngFile?.['Image Width']?.description ||
        tags.gif?.['Image Width']?.description;
    if (height && width) {
        let parsedHeight = Number.parseInt(height, 10);
        let parsedWidth = Number.parseInt(width, 10);

        // EXIF orientation values 5-8 indicate 90° rotation, so swap width/height
        // to get the effective display dimensions
        const orientation = tags.exif?.Orientation?.value;
        if (typeof orientation === 'number' && orientation >= 5 && orientation <= 8) {
            [parsedWidth, parsedHeight] = [parsedHeight, parsedWidth];
        }

        image.dimensions = {
            height: parsedHeight,
            width: parsedWidth,
        };
    } else {
        console.error(`Image [${image.title}] has no dimensions`);
    }

    // Check IPTC keywords first, then XMP subject
    const iptcKeywords = tags.iptc?.Keywords;
    if (iptcKeywords && Array.isArray(iptcKeywords) && iptcKeywords.length) {
        image.tags = iptcKeywords.map((keyword) => keyword.description);
    } else {
        const xmpSubject = tags.xmp?.subject?.value;
        if (xmpSubject && Array.isArray(xmpSubject) && xmpSubject.length) {
            image.tags = xmpSubject.map((item: { description: string }) => item.description);
        }
    }
    return image;
}
