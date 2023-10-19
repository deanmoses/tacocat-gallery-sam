const { getParentAndNameFromPath } = require("gallery-path-utils");

/**
 * Retrieve an album from DynamoDB.  Does not retrieve any child photos or child albums.
 *
 * @param {*} docClient AWS DynamoDB DocumentClient
 * @param {*} tableName Name of the table in DynamoDB containing gallery items
 * @param {*} path Path of the album to retrieve, like /2001/12-31/
 */
async function getAlbum(docClient, tableName, path) {
	const pathParts = getParentAndNameFromPath(path);
	const ddbparams = {
		TableName: tableName,
		Key: {
			parentPath: pathParts.parent,
			itemName: pathParts.name
		},
		ProjectionExpression:
			"itemName,parentPath,published,itemType,updatedOn,title,description,thumbnail"
	};
	const result = await docClient.get(ddbparams).promise();
	return result.Item;
}

module.exports = getAlbum;
