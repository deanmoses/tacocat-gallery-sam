import { CloudFrontResponseEvent, CloudFrontResponseResult, Handler } from 'aws-lambda';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { Readable } from 'stream';

enum ImageFormat {
    jpg = 'jpg',
    webp = 'webp',
}

/**
 * A Lambda used by CloudFront to resize images
 */
export const handler: Handler = async (event: CloudFrontResponseEvent): Promise<CloudFrontResponseResult> => {
    const request = event?.Records?.[0]?.cf?.request;
    const response = event?.Records?.[0]?.cf?.response;

    //
    // Check if a processed image already exists
    //

    // Only continue processing if the image was NOT found in S3 (403 or 404)
    // 403 Access Denied happens when caller doesn't have s3:ListBucket permission
    console.info('Image already exists');
    if (!['403', '404'].includes(response.status)) return response;

    //
    // Download the original
    //

    const originalsBucket = process.env.OriginalsBucket;
    if (!originalsBucket) throw 'Originals bucket not specified';
    console.info(`Bucket name: [${originalsBucket}]`);

    const key = request.uri.replace(/^\//, '');

    const s3Command = new GetObjectCommand({
        Bucket: originalsBucket,
        Key: key,
    });
    const client = new S3Client({});
    const img = await client.send(s3Command);
    const stream = img.Body as Readable;
    const fileContents = Buffer.concat(await stream.toArray());

    //
    // Get the specifications for the output image
    //

    const metadata = await sharp(fileContents).metadata();
    const queryParams = new URLSearchParams(request.querystring);
    const width = parseInt(queryParams.get('w')!, 10) || metadata.width;
    const height = parseInt(queryParams.get('h')!, 10) || undefined;
    const imageFormat = ImageFormat[(queryParams.get('f') as keyof typeof ImageFormat) || 'jpg'];
    const contentType = 'image/' + imageFormat;

    //
    // Process the image
    //

    const processedImage = sharp(fileContents).resize(width, height).toFormat(imageFormat, { quality: 95 });
    const imageBuffer = await processedImage.toBuffer();

    console.log('I processed an image!');

    //
    // TODO: save image to S3
    //

    //
    // Respond with processed image
    //

    const responseResults = {
        ...response,
        status: '200',
        statusDescription: 'OK',
        body: imageBuffer.toString('base64'),
        //bodyEncoding: 'base64',
        headers: {
            ...response.headers,
            'content-type': [{ key: 'Content-Type', value: contentType }],
        },
    };

    console.info('sharpTestLambda.ts: DONE');
    return responseResults;
};
