import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import ExifReader from 'exifreader';
import { Readable } from 'stream';
import { ImageUpdateRequest } from '../../lib/gallery/galleryTypes';

export async function extractImageMetadata(bucket: string, objectKey: string): Promise<ImageUpdateRequest> {
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
    // The MakerNote tag can be really large. Remove it to lower memory
    // usage if you're parsing a lot of files and saving the tags.
    if (tags.exif) {
        delete tags.exif['MakerNote'];
    }
    //console.debug('DateTimeOriginal: ', tags?.exif?.['DateTimeOriginal']?.description);
    //console.debug('IPTC', tags.iptc);

    const image: ImageUpdateRequest = {};
    image.title = tags.iptc?.['Object Name']?.description;
    image.description = tags.iptc?.['Caption/Abstract']?.description;
    if (tags.iptc?.Keywords?.length) {
        image.tags = [];
        tags.iptc?.Keywords?.forEach((keyword) => {
            image.tags?.push(keyword.description);
        });
    }
    return image;
}
