const { NotFoundException } = require("http-response-utils");
const generateDynamoUpdateParams = require("./update_image_query_generator.js");

/**
 * Update an image's attributes (like title and description) in DynamoDB
 *
 * @param {*} ctx execution context
 * @param {*} tableName Name of the table in DynamoDB containing gallery items
 * @param {*} path Path of the image to update, like /2001/12-31/image.jpg
 * @param {*} attributesToUpdate bag of attributes to update
 *
 * @returns {Object} result from DynamoDB if success, throws exception if there's a problem with the input
 */
async function getImage(ctx, path, attributesToUpdate) {
	const dynamoParams = generateDynamoUpdateParams(
		ctx.tableName,
		path,
		attributesToUpdate
	);

	try {
		return await ctx.doUpdate(dynamoParams);
	} catch (e) {
		if (e.toString().includes("conditional")) {
			throw new NotFoundException("Image not found: " + path);
		} else {
			throw e;
		}
	}
}

module.exports = getImage;
