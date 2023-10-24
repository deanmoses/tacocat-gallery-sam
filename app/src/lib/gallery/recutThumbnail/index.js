const recutThumbnail = require("./recut_thumbnail.js");
const generateThumbnail = require("./generate_thumbnail.js");
const { handleHttpExceptions } = require("http-response-utils");
const AWS = require("aws-sdk");

const s3 = new AWS.S3();
const s3BucketName = process.env.ORIGINAL_IMAGE_BUCKET; // name of the S3 containing original image
const originalImagePrefix = process.env.ORIGINAL_IMAGE_S3_PREFIX; // S3 key prefix under which to read original image
const derivedImageBucketName = process.env.DERIVED_IMAGE_BUCKET; // name of S3 bucket in which to store resized image
const thumbnailImagePrefix = process.env.THUMBNAIL_IMAGE_S3_PREFIX; // S3 key prefix under which to store resized image
const edgeSize = process.env.THUMBNAIL_IMAGE_SIZE; // longest edge of the resized image, in pixels
const jpegQuality = process.env.THUMBNAIL_IMAGE_QUALITY; // JPEG quality of the resized image
const tableName = process.env.GALLERY_ITEM_DDB_TABLE; // DyanmoDB table containing albums and images

const dynamoDocClient = new AWS.DynamoDB.DocumentClient({
	region: process.env.AWS_REGION
});

/**
 * Generate a thumbnail of an image stored in s3 and
 * store the thumbnail back in the same bucket
 * under the "Thumbnail/" prefix.
 *
 * @param {Object} event an AWS API Gateway event
 */
exports.handler = async event => {
	// Set up execution context
	// This is everything the lambda needs in order to execute
	// This is done to make the lambda unit testable
	const ctx = {};
	ctx.tableName = tableName;
	ctx.doSaveThumbCrop = async dynamoParams => {
		return dynamoDocClient.update(dynamoParams).promise();
	};
	ctx.doUpdateAlbumThumb = async dynamoParams => {
		return dynamoDocClient.batchWrite(dynamoParams).promise();
	};
	ctx.generateThumb = async (imagePath, crop) => {
		if (!s3BucketName) throw "Undefined s3BucketName";
		if (!originalImagePrefix) throw "Undefined originalImagePrefix";
		if (!derivedImageBucketName) throw "Undefined derivedImageBucketName";
		if (!thumbnailImagePrefix) throw "Undefined thumbnailImagePrefix";
		if (!edgeSize) throw "Undefined edgeSize";
		if (!jpegQuality) throw "Undefined jpegQuality";

		return await generateThumbnail(
			s3,
			s3BucketName,
			originalImagePrefix,
			derivedImageBucketName,
			thumbnailImagePrefix,
			edgeSize,
			jpegQuality,
			imagePath,
			crop
		);
	};

	//
	// Do the lambda's work
	//
	try {
		return await recutThumbnail(event, ctx);
	} catch (e) {
		return handleHttpExceptions(e);
	}
};
