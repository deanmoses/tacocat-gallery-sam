import {
    getDerivedImagesBucketName,
    getEdgeSize,
    getJpegQuality,
    getOriginalImagePrefix,
    getOriginalImagesBucketName,
    getThumbnailImagePrefix,
} from '../../lambda_utils/Env';
import { Crop } from '../galleryTypes';

const gm = require('gm').subClass({ imageMagick: true }); // Enable ImageMagick integration

/**
 * Generate a thumbnail of a JPEG image stored in an AWS S3 bucket and save
 * the thumbnail back in the same S3 bucket.
 *
 * @param imagePath path of image like /2001/12-31/image.jpg
 * @param crop thumbnail crop info in the format {x:INTEGER,y:INTEGER,length:INTEGER}
 *
 * @returns {} nothing if success
 * @throws exception if there's any problem
 */
export async function generateThumbnail(imagePath: string, crop: Crop) {
    const s3BucketName = getOriginalImagesBucketName();
    const originalImagePrefix = getOriginalImagePrefix();
    const derivedImageBucketName = getDerivedImagesBucketName();
    const thumbnailImagePrefix = getThumbnailImagePrefix();
    const edgeSize = getEdgeSize();
    const jpegQuality = getJpegQuality();

    // Get the original image
    let s3Object;
    try {
        s3Object = await s3
            .getObject({
                Bucket: s3BucketName,
                Key: originalImagePrefix + imagePath,
            })
            .promise();
    } catch (e) {
        if (e.code === 'AccessDenied') {
            throw new NotFoundException('No such image: ' + imagePath);
        } else {
            throw e;
        }
    }

    // Cut the thumbnail
    const buffer = await new Promise((resolve, reject) => {
        gm(s3Object.Body)
            .autoOrient()
            .crop(crop.length, crop.length, crop.x, crop.y)
            .resize(edgeSize, edgeSize + '^') // resize, ^ means overflow to get dimensions (shouldn't need it because I just cropped it to square)
            .interlace('Line') // aka JPEG Progressive
            .quality(jpegQuality)
            .noProfile() // remove EXIF, ICM, etc profile data // TODO: add copyright info
            .toBuffer('jpg', (err, buffer) => {
                if (err) {
                    return reject(err);
                }
                resolve(buffer);
            });
    });

    // Write the thumbnail to S3
    await s3
        .upload({
            Bucket: derivedImageBucketName,
            Key: thumbnailImagePrefix + imagePath,
            ContentType: 'image/jpeg',
            Body: buffer,
        })
        .promise();
}
