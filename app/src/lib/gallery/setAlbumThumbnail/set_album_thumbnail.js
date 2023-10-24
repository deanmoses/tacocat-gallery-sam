const { BadRequestException } = require("http-response-utils");
const { respondHttp } = require("http-response-utils");
const { setImageAsAlbumThumb } = require("dynamo-utils");
const { getParentAndNameFromPath } = require("gallery-path-utils");

/**
 * Sets specified album's thumbnail to the specified image
 *
 * @param {Object} event an event object coming from AWS API Gateway
 * @param {Object} ctx the environmental context needed to do the work
 */
async function setAlbumThumbnail(event, ctx) {
	if (!ctx) throw "Undefined ctx";

	// event.path is passed in from the API Gateway and contains the full path
	// of the HTTP request, such as  "/album-thumb/2001/12-31/"
	if (!event.path) throw new BadRequestException("URL path cannot be empty");

	// Remove the first segment of the URL path to get the album path
	const albumPath = event.path.replace("/album-thumb", "");

	// event.body contains the body of the HTTP request
	if (!event.body) throw new BadRequestException("HTTP body cannot be empty");

	// Turn the body into a javascript object
	let body = JSON.parse(event.body);

	if (!body) {
		throw new BadRequestException("Missing HTTP body");
	}

	if (!albumPath) {
		throw new BadRequestException("Must specify album");
	}

	assertWellFormedAlbumPath(albumPath);

	if (albumPath === "/") {
		throw new BadRequestException("Cannot update root album");
	}

	const imagePath = body.imagePath;
	if (!imagePath) {
		throw new BadRequestException("Missing imagePath");
	}

	assertWellFormedImagePath(imagePath);

	// Ensure only these attributes are in the input
	const validKeys = new Set(["imagePath"]);
	const keysToUpdate = Object.keys(body);
	keysToUpdate.forEach(keyToUpdate => {
		// Ensure we aren't trying to update an unknown attribute
		if (!validKeys.has(keyToUpdate)) {
			throw new BadRequestException("Unknown attribute: " + keyToUpdate);
		}
	});

	// Get image
	const imageResult = await getImage(ctx, imagePath);
	const image = imageResult.Item;
	const imageNotFound = image === undefined;
	if (imageNotFound)
		throw new BadRequestException("Image not found: " + imagePath);

	const thumbnailUpdatedOn = image.thumbnail
		? image.thumbnail.fileUpdatedOn
		: image.fileUpdatedOn;

	// TODO: this fails silently if the image or album doesn't exist
	// Instead, it should throw an exception
	await setImageAsAlbumThumb(
		ctx,
		albumPath,
		imagePath,
		thumbnailUpdatedOn,
		true /* replaceExistingThumb */
	);

	// Return success
	return respondHttp({
		message: "Album " + albumPath + " thumbnail set to " + imagePath
	});
}
module.exports = setAlbumThumbnail;

/**
 * Throw exception if it's not a well-formed album path
 */
function assertWellFormedAlbumPath(albumPath) {
	if (!albumPath.match(/^\/(\d\d\d\d\/(\d\d-\d\d\/)?)?$/)) {
		throw new BadRequestException("Malformed album path: '" + albumPath + "'");
	}
}

/**
 * Throw exception if it's not a well-formed image path
 */
function assertWellFormedImagePath(imagePath) {
	if (!imagePath.match(/^\/\d\d\d\d\/\d\d-\d\d\/.*\..*$/)) {
		throw new BadRequestException("Malformed image path: '" + imagePath + "'");
	}
}

/**
 * Return the specified image from DynamoDB
 *
 * @param {Object} ctx the environmental context needed to do the work
 * @param {*} imagePath Path of the image to retrieve, like /2001/12-31/image.jpg
 */
async function getImage(ctx, imagePath) {
	const pathParts = getParentAndNameFromPath(imagePath);
	const dynamoParams = {
		TableName: ctx.tableName,
		Key: {
			parentPath: pathParts.parent,
			itemName: pathParts.name
		},
		ProjectionExpression: "fileUpdatedOn,thumbnail"
	};
	return await ctx.doGetImage(dynamoParams);
}
