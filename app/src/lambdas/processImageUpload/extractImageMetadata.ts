import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import ExifReader from 'exifreader';
import { Readable } from 'stream';
import { ImageCreateRequest } from '../../lib/gallery/galleryTypes';

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
    const tags = ExifReader.load(fileContents, { expanded: true });
    return selectMetadata(tags);
}

/**
 * Extract the metadata to be saved to DynamoDB
 */
export function selectMetadata(tags: ExifReader.ExpandedTags): Partial<ImageCreateRequest> {
    const image: Partial<ImageCreateRequest> = {
        title: tags.iptc?.['Object Name']?.description || tags.iptc?.['Headline']?.description,
        description: tags.iptc?.['Caption/Abstract']?.description,
    };
    const height =
        tags.file?.['Image Height']?.description ||
        tags.exif?.ImageLength?.description ||
        tags.pngFile?.['Image Height']?.description;
    const width =
        tags.file?.['Image Width']?.description ||
        tags.exif?.ImageWidth?.description ||
        tags.pngFile?.['Image Width']?.description;
    if (height && width) {
        image.dimensions = {
            height: Number.parseInt(height, 10),
            width: Number.parseInt(width, 10),
        };
    } else {
        console.error(`Image [${image.title}] has no dimensions`);
    }

    if (tags.iptc?.Keywords?.length) {
        image.tags = [];
        tags.iptc?.Keywords?.forEach((keyword) => {
            image.tags?.push(keyword.description);
        });
    }
    return image;
}
