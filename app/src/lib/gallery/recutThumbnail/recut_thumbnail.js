const { BadRequestException } = require("http-response-utils");
const { NotFoundException } = require("http-response-utils");
const { respondHttp } = require("http-response-utils");
const { getParentAndNameFromPath } = require("gallery-path-utils");
const { DynamoUpdateBuilder } = require("dynamo-utils");

/**
 * Generate a thumbnail of an image stored in s3 and
 * store the thumbnail back in the same bucket under the "Thumbnail/" prefix.
 *
 * @param {Object} event an event object coming from AWS API Gateway
 * @param {Object} ctx the environmental context needed to do the work
 */
async function recutThumbnail(event, ctx) {
	if (!ctx) throw "Undefined ctx";

	// event.path is passed in from the API Gateway and contains the full path
	// of the HTTP request, such as  "/thumb/2001/12-31/image.jpg"
	if (!event.path) throw new BadRequestException("HTTP path cannot be empty");

	// event.body contains the body of the HTTP request
	if (!event.body) throw new BadRequestException("HTTP body cannot be empty");

	// Remove the first segment of the URL path to get the image path
	const imagePath = event.path.replace("/thumb", "");

	// Turn the body into a javascript object
	let crop = JSON.parse(event.body);

	if (!crop) {
		throw new BadRequestException("Crop not specified");
	}

	// Validate that the body contains everything we need
	checkInt("x", crop.x);
	checkInt("y", crop.y);
	checkInt("length", crop.length);

	// Ensure crop values are stored as numbers, not strings
	crop = {
		x: Number(crop.x),
		y: Number(crop.y),
		length: Number(crop.length)
	};

	// Cut the new thumbnail
	await ctx.generateThumb(imagePath, crop);

	// Set timestamp of the crop
	const thumbUpdatedOn = new Date().toISOString();
	crop.fileUpdatedOn = thumbUpdatedOn;

	// Save the crop to DynamoDB
	const updateResult = await saveThumbnailCropInfoToDynamo(
		ctx,
		imagePath,
		crop
	);

	// For every album for which the image is the thumb,
	// update the album’s thumbnail.fileUpdatedOn
	if (updateResult.thumbForAlbums.length > 0) {
		await updateAlbumThumbs(
			ctx,
			updateResult.thumbForAlbums,
			imagePath,
			thumbUpdatedOn
		);
	}

	// Build success message
	let msg = "Recut thumbnail of image " + imagePath;
	if (updateResult.thumbForAlbums.length > 0) {
		msg += ". Updated thumb info on these albums:";
		for (const albumPath of updateResult.thumbForAlbums) {
			msg += " " + albumPath;
		}
	}

	return respondHttp({ successMessage: msg });
}
module.exports = recutThumbnail;

/**
 * Return false if the passed-in thing is a positive integer
 * @param {boolean}
 */
function checkInt(name, value) {
	if (!isInt(value)) {
		throw new BadRequestException("Invalid " + name + ": (" + value + ")");
	}
}

/**
 * Return true if the passed-in thing is a positive integer
 * @param {boolean}
 */
function isInt(x) {
	if (x === undefined) return false;
	if (typeof x === "string") {
		return x.match(/^\d+$/);
	}
	if (typeof x === "number" && Number.isInteger(x) && Math.sign(x) >= 0)
		return true;

	return false;
}

/**
 * Save image thumbnail crop info to DynamoDB
 *
 * @param {Object} ctx execution context
 * @param {String} imagePath Path of the image to update, like /2001/12-31/image.jpg
 * @param {Object} crop thumbnail crop info in the format {x:INTEGER,y:INTEGER,length:INTEGER}
 *
 * @returns {Object} empty {} object if success
 * @throws {Object} the albums that this image is the thumbnail for, like:
 *   {
 * 	    thumbForAlbums: ["/2001/12-31/"],
 * 	    albumCount: 1
 *   }
 */
async function saveThumbnailCropInfoToDynamo(ctx, imagePath, crop) {
	const bldr = new DynamoUpdateBuilder();
	bldr.add("updatedOn", new Date().toISOString());
	bldr.add("thumbnail", crop);

	const pathParts = getParentAndNameFromPath(imagePath);

	const dynamoParams = {
		TableName: ctx.tableName,
		Key: {
			parentPath: pathParts.parent,
			itemName: pathParts.name
		},
		UpdateExpression: bldr.getUpdateExpression(),
		ExpressionAttributeValues: bldr.getExpressionAttributeValues(),
		ConditionExpression: "attribute_exists (itemName)",
		ReturnValues: "ALL_NEW"
	};

	let updatedImage;
	try {
		updatedImage = await ctx.doSaveThumbCrop(dynamoParams);
	} catch (e) {
		if (e.toString().includes("conditional")) {
			throw new NotFoundException("Image not found: " + imagePath);
		} else {
			throw e;
		}
	}

	//
	// Extract the albums that the image is the thumb on, if any
	//
	// This operates over a result from DynamoDB that looks like this:
	// {
	//   "Attributes": {
	// 		...
	//   	"thumbForAlbums": {
	// 			"wrapperName": "Set",
	// 			"values": [
	// 	  			"/2018/01-24/"
	// 			],
	// 			"type": "String"
	//   	},
	//   ...
	// 	 }
	// }
	//

	const result = {};
	const thumbForAlbums = updatedImage.Attributes.thumbForAlbums;
	if (thumbForAlbums !== undefined) {
		result.thumbForAlbums = thumbForAlbums.values;
		result.albumCount = thumbForAlbums.values.length;
	} else {
		result.thumbForAlbums = [];
		result.albumCount = 0;
	}
	return result;
}

/**
 * For every album for which the image is the thumb, update the album’s
 * thumbnail.fileUpdatedOn
 *
 * @param {Object} ctx the environmental context needed to do the work
 * @param {Array} thumbForAlbums array of albums like ["/2001/12-31/"]
 */
async function updateAlbumThumbs(
	ctx,
	thumbForAlbums,
	imagePath,
	thumbUpdatedOn
) {
	if (!imagePath) throw "Undefined imagePath";
	if (!thumbUpdatedOn) throw "Undefined thumbUpdatedOn";
	const now = new Date().toISOString();

	// TODO: we don't want to loop through DynamoDB calls:
	// 1) If there's a lot of albums to loop through, we'll time out
	// 2) If there's an error, there's no retry built in
	// Unfortuately there's no batch call for updates; batch is just for puts and deletes.
	// And we don't want a a transaction: we don't want all of them to fail
	// if one of them fails.
	// So probably the best bet is to make a StepFunction that can
	// retry each one individually if it fails.

	// For every album for which the image is the thumb,
	// update the album' thumbnail.fileUpdatedOn
	for (const albumPath of thumbForAlbums) {
		const bldr = new DynamoUpdateBuilder();
		bldr.add("updatedOn", now);
		bldr.addAlias("thumbnail.fileUpdatedOn", "thumbUpdatedOn", thumbUpdatedOn);
		bldr.addValue("imagePath", imagePath);

		const pathParts = getParentAndNameFromPath(albumPath);

		const dynamoParams = {
			TableName: ctx.tableName,
			Key: {
				parentPath: pathParts.parent,
				itemName: pathParts.name
			},
			UpdateExpression: bldr.getUpdateExpression(),
			ExpressionAttributeValues: bldr.getExpressionAttributeValues(),
			ConditionExpression:
				"attribute_exists (itemName) and thumbnail.path = :imagePath"
		};

		// Do the update
		try {
			await ctx.doUpdateAlbumThumb(dynamoParams);
		} catch (e) {
			// If the condition isn't met, it's either because the album
			// doesn't exist or the image is no longer its thumbnail.  In
			// either case, it's not an error.
			if (!e.toString().includes("conditional")) {
				// If it *is* an error, do we really want to stop execution of the others? No!
				// But we want this here for debuggability
				throw e;
			}
		}
	}
}
