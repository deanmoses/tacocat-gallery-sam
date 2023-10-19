/**
 * Get an album's immediate children: both images and subalbums.
 * Does not get grandchildren.
 *
 * @param {*} docClient AWS DynamoDB DocumentClient
 * @param {*} tableName Name of the table in DynamoDB containing gallery items
 * @param {*} path Path of the album whose children are to be retrieved, like /2001/12-31/
 */
async function getChildren(docClient, tableName, path) {
	const ddbparams = {
		TableName: tableName,
		KeyConditionExpression: "parentPath = :parentPath",
		ExpressionAttributeValues: {
			":parentPath": path
		},
		ProjectionExpression:
			"itemName,parentPath,published,itemType,updatedOn,dimensions,title,description,thumbnail"
	};
	const results = await docClient.query(ddbparams).promise();
	return results.Items;
}

module.exports = getChildren;
