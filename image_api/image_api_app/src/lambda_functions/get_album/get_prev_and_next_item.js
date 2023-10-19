const { getParentAndNameFromPath } = require("gallery-path-utils");
const getChildren = require("./get_children.js");

/**
 * Given an album or image, retrieve both the previous and next album or image from DynamoDB.
 *
 * Just retrieves enough information to display a thumbnail: does not retrieve any
 * child photos or child albums.
 *
 * @param {*} docClient AWS DynamoDB DocumentClient
 * @param {*} tableName Name of the table in DynamoDB containing gallery items
 * @param {*} path Path of the item, like /2001/12-31/ or /2001/12-31/felix.jpg
 */
async function getPrevAndNextItem(docClient, tableName, path) {
	const pathParts = getParentAndNameFromPath(path);

	// retrieve the item's peers
	const peers = await getChildren(docClient, tableName, pathParts.parent);

	// find prev & next
	let prev;
	let next;
	let foundCurrent = false;
	peers.some(peer => {
		// if we're still searching for the current item
		if (!foundCurrent) {
			if (peer.itemName === pathParts.name) {
				foundCurrent = true;
			} else if (peer.published) {
				prev = peer;
			}
		}
		// else we're past the current item and searching for the next published album
		else {
			if (peer.published) {
				next = peer;
				return true; // functions as a break, stops the execution of some()
			}
		}
	});

	return {
		prev: prev,
		next: next
	};
}

module.exports = getPrevAndNextItem;
