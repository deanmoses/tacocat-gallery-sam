const { NotFoundException } = require("http-response-utils");
const gm = require("gm").subClass({ imageMagick: true }); // Enable ImageMagick integration

/**
 * Generate a thumbnail of a JPEG image stored in an AWS S3 bucket and save
 * the thumbnail back in the same S3 bucket.
 *
 * @param {*} s3 AWS S3 client
 * @param {*} s3BucketName name of the S3 bucket in which the original images are are stored
 * @param {*} originalImagePrefix the S3 prefix of the original images, such as "albums"
 * @param {*} derivedImageBucketName name of S3 bucket in which to store resized image
 * @param {*} thumbnailImagePrefix the S3 prefix of the thumbnail images, such as "thumbnails"
 * @param {*} edgeSize longest edge of the thumbnail image, in pixels
 * @param {*} jpegQuality JPEG quality of the resized image
 * @param {*} imagePath path of image like /2001/12-31/image.jpg
 * @param {*} crop thumbnail crop info in the format {x:INTEGER,y:INTEGER,length:INTEGER}
 *
 * @returns {} nothing if success
 * @throws exception if there's any problem
 */
async function generateThumbnail(
	s3,
	s3BucketName,
	originalImagePrefix,
	derivedImageBucketName,
	thumbnailImagePrefix,
	edgeSize,
	jpegQuality,
	imagePath,
	crop
) {
	// Get the original image
	let s3Object;
	try {
		s3Object = await s3
			.getObject({
				Bucket: s3BucketName,
				Key: originalImagePrefix + imagePath
			})
			.promise();
	} catch (e) {
		if (e.code === "AccessDenied") {
			throw new NotFoundException("No such image: " + imagePath);
		} else {
			throw e;
		}
	}

	// Cut the thumbnail
	const buffer = await new Promise((resolve, reject) => {
		gm(s3Object.Body)
			.autoOrient()
			.crop(crop.length, crop.length, crop.x, crop.y)
			.resize(edgeSize, edgeSize + "^") // resize, ^ means overflow to get dimensions (shouldn't need it because I just cropped it to square)
			.interlace("Line") // aka JPEG Progressive
			.quality(jpegQuality)
			.noProfile() // remove EXIF, ICM, etc profile data // TODO: add copyright info
			.toBuffer("jpg", (err, buffer) => {
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
			ContentType: "image/jpeg",
			Body: buffer
		})
		.promise();
}

module.exports = generateThumbnail;
