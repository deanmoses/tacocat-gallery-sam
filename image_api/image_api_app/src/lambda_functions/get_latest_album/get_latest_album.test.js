const getLatestAlbum = require("./get_latest_album.js");
const AWS = require("aws-sdk");
const AWS_MOCK = require("aws-sdk-mock");
const awsRegion = "us-west-2";
const tableName = "NotARealTableName";

test("Get Album", async () => {
	expect.assertions(4);

	const parentPath = "/2001/12-31/";
	const itemName = "12-31";
	const updatedOn = "2001-12-31T23:59:59Z";

	// Mock out the AWS method
	const mockResponse = {
		Items: [
			{
				itemName: itemName,
				parentPath: parentPath,
				updatedOn: updatedOn
			}
		]
	};
	AWS_MOCK.mock("DynamoDB.DocumentClient", "query", mockResponse);

	// Create the AWS service *after* the service method has been mocked
	const docClient = new AWS.DynamoDB.DocumentClient({
		region: awsRegion
	});

	const result = await getLatestAlbum(docClient, tableName);
	const album = result.album;
	expect(album).toBeDefined();
	expect(album.itemName).toBe(itemName);
	expect(album.parentPath).toBe(parentPath);
	expect(album.updatedOn).toBe(updatedOn);
	AWS_MOCK.restore("DynamoDB.DocumentClient");
});

test("Get Nonexistent Album", async () => {
	expect.assertions(1);

	// Mock out the AWS method
	const mockResponse = {
		Items: []
	};
	AWS_MOCK.mock("DynamoDB.DocumentClient", "query", mockResponse);

	// Create the AWS service *after* the service method has been mocked
	const docClient = new AWS.DynamoDB.DocumentClient({
		region: awsRegion
	});

	const result = await getLatestAlbum(docClient, tableName);
	expect(result).toBeUndefined();
	AWS_MOCK.restore("DynamoDB.DocumentClient");
});
