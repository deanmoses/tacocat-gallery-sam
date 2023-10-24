/**
 * Retrieve the latest album or image in the specified parent album from DynamoDB.
 *
 * Just retrieves enough information to display a thumbnail: does not retrieve any
 * child photos or child albums.
 *
 * @param {*} docClient AWS DynamoDB DocumentClient
 * @param {*} tableName Name of the table in DynamoDB containing gallery items
 * @param {*} path Path of the parent album, like /2001/12-31/
 */
async function getLatestItemInAlbum(docClient, tableName, path) {
	// find the most recent album within the current year
	const ddbparams = {
		TableName: tableName,
		KeyConditionExpression: "parentPath = :parentPath",
		ExpressionAttributeValues: {
			":parentPath": path
		},
		ProjectionExpression:
			"itemName,parentPath,itemType,updatedOn,title,description",
		Limit: 1, // # of results to return
		ScanIndexForward: false // sort results in descending order, i.e., newest first
	};
	const result = await docClient.query(ddbparams).promise();
	return result.Items.length === 0 ? undefined : result.Items[0];
}

module.exports = getLatestItemInAlbum;
