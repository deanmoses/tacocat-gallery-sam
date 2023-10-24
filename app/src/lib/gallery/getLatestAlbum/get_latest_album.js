const getLatestItemInAlbum = require("./get_latest_item_in_album.js");

/**
 * Retrieve the latest album in the gallery from DynamoDB.  Just retrieves
 * enough information to display a thumbnail: does not retrieve any child
 * photos or child albums.
 *
 * @param {*} docClient AWS DynamoDB DocumentClient
 * @param {*} tableName Name of the table in DynamoDB containing gallery items
 * @return object of format {album: {}, children: {}} or undefined if there's no album yet this year
 */
async function getLatestAlbum(docClient, tableName) {
	// get current year's album
	const currentYearAlbumPath = "/" + new Date().getUTCFullYear() + "/";
	const album = await getLatestItemInAlbum(
		docClient,
		tableName,
		currentYearAlbumPath
	);
	if (!album) return;
	else {
		// get the latest album of the current year
		return {
			album: await getLatestItemInAlbum(
				docClient,
				tableName,
				currentYearAlbumPath
			)
		};
	}
}

module.exports = getLatestAlbum;
