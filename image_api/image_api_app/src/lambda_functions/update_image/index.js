const AWS = require("aws-sdk");
const updateImage = require("./update_image.js");
const { handleHttpExceptions } = require("http-response-utils");
const { respondHttp } = require("http-response-utils");

const tableName = process.env.GALLERY_ITEM_DDB_TABLE;

const docClient = new AWS.DynamoDB.DocumentClient({
	region: process.env.AWS_REGION
});

/**
 * A Lambda function that updates an image's attributes (like title and description) in DynamoDB
 *
 * @param {Object} event an AWS API Gateway event
 */
exports.handler = async event => {
	// event.path is passed in from the API Gateway and contains the full path
	// of the HTTP request, which starts with "/images/..."
	const path = event.path.replace("/image", "");

	// event.body is passed in from the API Gateway and contains the body of
	// the HTTP request
	if (!event.body) {
		return respondHttp({ errorMessage: "HTTP body cannot be empty" }, 400);
	}
	const attributesToUpdate = JSON.parse(event.body);

	try {
		// Set up execution context
		// This is everything the lambda needs in order to execute
		// This is done to make the lambda unit testable
		let ctx = {};
		ctx.tableName = tableName;
		ctx.doUpdate = async dynamoParams => {
			return docClient.update(dynamoParams).promise();
		};

		// Do the lambda's work
		await updateImage(ctx, path, attributesToUpdate);

		// Return success
		return respondHttp({ message: "Updated" });
	} catch (e) {
		return handleHttpExceptions(e);
	}
};
