const AWS = require("aws-sdk");
const getLatestAlbum = require("./get_latest_album.js");

const tableName = process.env.GALLERY_ITEM_DDB_TABLE;

const docClient = new AWS.DynamoDB.DocumentClient({
	region: process.env.AWS_REGION
});

/**
 * A Lambda function that retrieves the latest album in the gallery from DynamoDB.
 *
 * Just retrieves enough information to display a thumbnail: does not retrieve any
 * child photos or child albums.
 */
exports.handler = async () => {
	const album = await getLatestAlbum(docClient, tableName);
	if (!album) {
		return {
			isBase64Encoded: false,
			statusCode: 200,
			body: JSON.stringify({})
		};
	} else {
		return {
			isBase64Encoded: false,
			statusCode: 200,
			body: JSON.stringify(album)
		};
	}
};
