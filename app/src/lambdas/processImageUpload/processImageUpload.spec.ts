import { processImageUpload } from './processImageUpload';

describe('Invalid Image S3 Keys', () => {
    const s3keys = [
        '',
        '/',
        'image',
        'image.jpg', // no images in root album
        '/image.jpg',
        '.jpg',
        '2000',
        '/2000',
        '2000/',
        '2000/image.jpg', // no images in year albums
        '2000/12-31',
        '/2000/12-31/image.jpg', // no preceding slash in bucket keys
        '2000/12-31/image',
    ];

    s3keys.forEach((s3key) => {
        test(`S3 key should be invalid: [${s3key}]`, async () => {
            await expect(processImageUpload('bucket', s3key)).rejects.toThrow(/invalid/i);
        });
    });
});
