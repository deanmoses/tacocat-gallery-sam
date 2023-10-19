const AWS = require("aws-sdk");
const getAlbumAndChildren = require("./get_album_and_children.js");

const tableName = process.env.GALLERY_ITEM_DDB_TABLE;

const docClient = new AWS.DynamoDB.DocumentClient({
	region: process.env.AWS_REGION
});

/**
 * A Lambda function that gets an album and its child images and child albums from DynamoDB
 *
 * @param {Object} event an AWS API Gateway event
 */
exports.handler = async event => {
	// event.path is passed in from the API Gateway and represents the full
	// path of the HTTP request, which starts with "/albums/..."
	const albumPath = event.path.replace("/album", "");
	const album = await getAlbumAndChildren(docClient, tableName, albumPath);
	if (!album) {
		return {
			isBase64Encoded: false,
			statusCode: 404,
			body: JSON.stringify({ errorMessage: "Album Not Found" })
		};
	} else {
		return {
			isBase64Encoded: false,
			statusCode: 200,
			body: JSON.stringify(album)
		};
	}
};
