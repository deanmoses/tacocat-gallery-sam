const AWS = require("aws-sdk");
const setAlbumThumbnail = require("./set_album_thumbnail.js");
const { handleHttpExceptions } = require("http-response-utils");

const tableName = process.env.GALLERY_ITEM_DDB_TABLE;

const docClient = new AWS.DynamoDB.DocumentClient({
	region: process.env.AWS_REGION
});

/**
 * A Lambda function that sets an album's thumbnail to the specified image
 *
 * @param {Object} event an AWS API Gateway event
 */
exports.handler = async event => {
	try {
		// Set up execution context
		// This is everything the lambda needs in order to execute
		// This is done to make the lambda unit testable
		let ctx = {};
		ctx.tableName = tableName;
		ctx.doGetImage = async dynamoParams => {
			return docClient.get(dynamoParams).promise();
		};
		// Set the album thumbnail -- TODO rename this to describe what it does
		ctx.doTransaction = async dynamoParams => {
			return docClient.transactWrite(dynamoParams).promise();
		};

		// Do the lambda's work
		return await setAlbumThumbnail(event, ctx);
	} catch (e) {
		return handleHttpExceptions(e);
	}
};
