const { getParentAndNameFromPath } = require("gallery-path-utils");
const DynamoUpdateBuilder = require("./DynamoUpdateBuilder.js");

/**
 * Set image as the album's thumb IF album doesn't have a thumb.
 * If album already has thumb, this will fail silently.
 *
 * @param {Object} ctx execution context
 * @param {String} albumPath Path of the album like /2001/12-31/
 * @param {String} imagePath Path of the image like /2001/12-31/image.jpg
 * @param {String} imageUpdatedOn ISO 8601 timestamp of when image was last updated
 * @param {Boolean} replaceExistingThumb true (default): replace existing thumbnail
 *
 * @returns {Boolean} true if the album's thumb was updated; false if the album already had a thumb
 */
async function setImageAsAlbumThumb(
	ctx,
	albumPath,
	imagePath,
	imageUpdatedOn,
	replaceExistingThumb = true
) {
	// Build a transaction command
	// This transaction does two things:
	// 1) sets the image as the thumbnail on the album
	// 2) records it on the image
	// If the albums already has a thumbnail, a conditional check fails and the entire transaction fails
	const dynamoParams = {
		TransactItems: []
	};
	dynamoParams.TransactItems.push(
		// Set the image as the album's thumbnail if album doesn't have one
		setImageOnAlbum(
			ctx,
			albumPath,
			imagePath,
			imageUpdatedOn,
			replaceExistingThumb
		)
	);
	dynamoParams.TransactItems.push(
		// Tell the image that it's the album's thumb
		setAlbumOnImage(ctx, imagePath, albumPath)
	);

	// Do the transaction
	try {
		await ctx.doTransaction(dynamoParams);
		return true;
	} catch (err) {
		// ConditionalCheckFailed means the album already has a thumb.
		// That's not an error. Everything else is an error.
		const conditionalCheckFailed =
			err.code === "TransactionCanceledException" &&
			err.message.indexOf("ConditionalCheckFailed") >= 0;
		if (!conditionalCheckFailed) {
			throw err;
		}
	}
	return false;
}
module.exports = setImageAsAlbumThumb;

/**
 * Generate DynamoDB command to set the album's thumbnail
 *
 * @param {Object} ctx execution context
 * @param {String} albumPath Path of the album like /2001/12-31/
 * @param {String} imagePath Path of the thumbnail image like /2001/12-31/image.jpg
 * @param {String} imageUpdatedOn ISO 8601 timestamp of when thumbnail was last updated
 * @param {Boolean} replaceExistingThumb true: replace existing thumbnail
 *
 * @returns {Object} DynamoDB update command
 */
function setImageOnAlbum(
	ctx,
	albumPath,
	imagePath,
	imageUpdatedOn,
	replaceExistingThumb
) {
	const bldr = new DynamoUpdateBuilder();
	bldr.add("updatedOn", new Date().toISOString());
	bldr.add("thumbnail", { path: imagePath, fileUpdatedOn: imageUpdatedOn });

	const pathParts = getParentAndNameFromPath(albumPath);

	const dynamoParams = {
		Update: {
			TableName: ctx.tableName,
			Key: {
				parentPath: pathParts.parent,
				itemName: pathParts.name
			},
			UpdateExpression: bldr.getUpdateExpression(),
			ExpressionAttributeValues: bldr.getExpressionAttributeValues(),
			ConditionExpression: "attribute_exists (itemName)"
		}
	};
	if (!replaceExistingThumb) {
		dynamoParams.Update.ConditionExpression =
			"(attribute_exists (itemName) and attribute_not_exists (thumbnail))";
	}

	return dynamoParams;
}

/**
 * Generate DynamoDB command to let an image know that it is the thumbnail for an album
 *
 * @param {Object} ctx execution context
 * @param {String} imagePath Path of the image like /2001/12-31/image.jpg
 * @param {String} albumPath Path of the album who now has the image as a thumbnail like /2001/12-31/
 *
 * @returns {Object} DynamoDB update command
 */
function setAlbumOnImage(ctx, imagePath, albumPath) {
	const bldr = new DynamoUpdateBuilder();
	bldr.add("updatedOn", new Date().toISOString());
	bldr.addToSet("thumbForAlbums", albumPath);

	const pathParts = getParentAndNameFromPath(imagePath);

	const dynamoParams = {
		Update: {
			TableName: ctx.tableName,
			Key: {
				parentPath: pathParts.parent,
				itemName: pathParts.name
			},
			UpdateExpression: bldr.getUpdateExpression(),
			ExpressionAttributeValues: bldr.getExpressionAttributeValues(),
			ConditionExpression: "attribute_exists (itemName)"
		}
	};

	return dynamoParams;
}
