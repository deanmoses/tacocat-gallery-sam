const getLatestItemInAlbum = require("./get_latest_item_in_album.js");
const AWS = require("aws-sdk");
const AWS_MOCK = require("aws-sdk-mock");
const awsRegion = "us-west-2";
const tableName = "NotARealTableName";

test("Get Latest Item In Album", async () => {
	expect.assertions(3);

	const albumPath = "/not/a/real/album";
	const uploadTimeStamp = 1541787209;

	// Mock out the AWS method
	const mockResponse = {
		Items: [{ albumID: albumPath, uploadTimeStamp: uploadTimeStamp }]
	};
	AWS_MOCK.mock("DynamoDB.DocumentClient", "query", mockResponse);

	// Create the AWS service *after* the service method has been mocked
	const docClient = new AWS.DynamoDB.DocumentClient({
		region: awsRegion
	});

	const result = await getLatestItemInAlbum(docClient, tableName, albumPath);
	expect(result).toBeDefined();
	expect(result.albumID).toBe(albumPath);
	expect(result.uploadTimeStamp).toBe(uploadTimeStamp);
	AWS_MOCK.restore("DynamoDB.DocumentClient");
});

test("Get Latest Item In Nonexistent Album", async () => {
	expect.assertions(1);

	const albumPath = "/not/a/real/album";

	// Mock out the AWS method
	const mockResponse = {
		Items: []
	};
	AWS_MOCK.mock("DynamoDB.DocumentClient", "query", mockResponse);

	// Create the AWS service *after* the service method has been mocked
	const docClient = new AWS.DynamoDB.DocumentClient({
		region: awsRegion
	});

	const result = await getLatestItemInAlbum(docClient, tableName, albumPath);
	expect(result).toBeUndefined();
	AWS_MOCK.restore("DynamoDB.DocumentClient");
});
