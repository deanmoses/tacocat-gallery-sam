const { BadRequestException } = require("http-response-utils");
const { getParentAndNameFromPath } = require("gallery-path-utils");
const { DynamoUpdateBuilder } = require("dynamo-utils");

/**
 * Generate the query to update an image's attributes (like title and description) in DynamoDB
 *
 * @param {String} tableName Name of the table in DynamoDB containing gallery items
 * @param {String} imagePath Path of the image to update, like /2001/12-31/image.jpg
 * @param {Object} attributesToUpdate bag of attributes to update
 *
 * @returns {Object} query to execute, or throws exception if there's a problem with the input
 */
function generateUpdateImageQuery(tableName, imagePath, attributesToUpdate) {
	if (!imagePath) {
		throw new BadRequestException("Must specify image");
	}

	assertWellFormedImagePath(imagePath);

	if (!attributesToUpdate) {
		throw new BadRequestException("No attributes to update");
	}

	const keysToUpdate = Object.keys(attributesToUpdate);

	if (keysToUpdate.length === 0) {
		throw new BadRequestException("No attributes to update");
	}

	// Ensure only these attributes are in the input
	const validKeys = new Set(["title", "description"]);
	keysToUpdate.forEach(keyToUpdate => {
		// Ensure we aren't trying to update an unknown attribute
		if (!validKeys.has(keyToUpdate)) {
			throw new BadRequestException("Unknown attribute: " + keyToUpdate);
		}
	});

	//
	// Build the Dynamo DB expression
	//

	const bldr = new DynamoUpdateBuilder();
	keysToUpdate.forEach(keyToUpdate => {
		bldr.add(keyToUpdate, attributesToUpdate[keyToUpdate]);
	});

	bldr.add("updatedOn", new Date().toISOString()); // Always set the update time

	const pathParts = getParentAndNameFromPath(imagePath);

	return {
		TableName: tableName,
		Key: {
			parentPath: pathParts.parent,
			itemName: pathParts.name
		},
		UpdateExpression: bldr.getUpdateExpression(),
		ExpressionAttributeValues: bldr.getExpressionAttributeValues(),
		ConditionExpression: "attribute_exists (itemName)"
	};
}
module.exports = generateUpdateImageQuery;

/**
 * Throw exception if it's not a well-formed image path
 */
function assertWellFormedImagePath(imagePath) {
	if (!imagePath.match(/^\/\d\d\d\d\/\d\d-\d\d\/.*\..*$/)) {
		throw new BadRequestException("Malformed image path: '" + imagePath + "'");
	}
}
