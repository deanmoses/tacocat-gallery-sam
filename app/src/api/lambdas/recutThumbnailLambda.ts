const s3BucketName = process.env.ORIGINAL_IMAGE_BUCKET; // name of the S3 containing original image
const originalImagePrefix = process.env.ORIGINAL_IMAGE_S3_PREFIX; // S3 key prefix under which to read original image
import { APIGatewayProxyEvent, APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda';
import { BadRequestException } from '../../lib/api_gateway_utils/BadRequestException';
import { handleHttpExceptions } from '../../lib/api_gateway_utils/ApiGatewayResponseHelpers';

const derivedImageBucketName = process.env.DERIVED_IMAGE_BUCKET; // name of S3 bucket in which to store resized image
const thumbnailImagePrefix = process.env.THUMBNAIL_IMAGE_S3_PREFIX; // S3 key prefix under which to store resized image
const edgeSize = process.env.THUMBNAIL_IMAGE_SIZE; // longest edge of the resized image, in pixels
const jpegQuality = process.env.THUMBNAIL_IMAGE_QUALITY; // JPEG quality of the resized image

/**
 * Generate a thumbnail of an image stored in s3 and
 * store the thumbnail back in the same bucket
 * under the "Thumbnail/" prefix.
 */
export const handler: APIGatewayProxyHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        if (event?.httpMethod !== 'PUT') {
            throw new BadRequestException('This can only be called from a HTTP PUT');
        }

        const tableName = process.env.GALLERY_ITEM_DDB_TABLE;
        if (!tableName) {
            throw 'No GALLERY_ITEM_DDB_TABLE defined';
        }

        const imagePath = event?.pathParameters?.imagePath;
        if (!imagePath) {
            throw new BadRequestException('No image path specified');
        }

        // Set up execution context
        // This is everything the lambda needs in order to execute
        // This is done to make the lambda unit testable
        const ctx = {};
        ctx.doSaveThumbCrop = async (dynamoParams) => {
            return dynamoDocClient.update(dynamoParams).promise();
        };
        ctx.doUpdateAlbumThumb = async (dynamoParams) => {
            return dynamoDocClient.batchWrite(dynamoParams).promise();
        };
        ctx.generateThumb = async (imagePath, crop) => {
            if (!s3BucketName) throw 'Undefined s3BucketName';
            if (!originalImagePrefix) throw 'Undefined originalImagePrefix';
            if (!derivedImageBucketName) throw 'Undefined derivedImageBucketName';
            if (!thumbnailImagePrefix) throw 'Undefined thumbnailImagePrefix';
            if (!edgeSize) throw 'Undefined edgeSize';
            if (!jpegQuality) throw 'Undefined jpegQuality';

            return await generateThumbnail(
                s3,
                s3BucketName,
                originalImagePrefix,
                derivedImageBucketName,
                thumbnailImagePrefix,
                edgeSize,
                jpegQuality,
                imagePath,
                crop,
            );
        };

        return await recutThumbnail(tableName, imagePath);
    } catch (e) {
        return handleHttpExceptions(e);
    }
};
