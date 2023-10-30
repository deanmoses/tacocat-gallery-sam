import { CloudFrontResponseEvent, CloudFrontResponseResult, Handler } from 'aws-lambda';
import sharp from 'sharp';

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

    if (!response.body) {
        response.body = 'No response body';
        return response;
    }

    if (response.status !== '200') {
        return response;
    }

    const originalBuffer = Buffer.from(response.body!, 'base64');
    const metadata = await sharp(originalBuffer).metadata();

    const queryParams = new URLSearchParams(request.querystring);
    const width = parseInt(queryParams.get('w')!, 10) || metadata.width;
    const height = parseInt(queryParams.get('h')!, 10) || metadata.height;
    const imageFormat = ImageFormat[(queryParams.get('f') as keyof typeof ImageFormat) || 'jpg'];
    const contentType = 'image/' + imageFormat;

    const processedImage = sharp(originalBuffer).resize(width, height).toFormat(imageFormat, { quality: 95 });
    const imageBuffer = await processedImage.toBuffer();

    console.log('I processed an image!');

    response.body = imageBuffer.toString('base64');
    response.headers['content-type'] = [{ key: 'Content-Type', value: contentType }];

    console.info('sharpTestLambda.ts: DONE');
    return response;
};
