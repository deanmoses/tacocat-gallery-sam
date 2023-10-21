const getChildren = require("./get_children.js");
const AWS = require("aws-sdk");
const AWS_MOCK = require("aws-sdk-mock");
const awsRegion = "us-west-2";
const tableName = "NotARealTableName";
const albumId = "/not/a/real/album";

test("Get Child Albums", async () => {
	expect.assertions(5);

	// Mock out the AWS method
	const mockResponse = {
		Items: [{ albumID: "/2001/12-31", uploadTimeStamp: 1541787209 }],
		Count: 1,
		ScannedCount: 1
	};
	AWS_MOCK.mock("DynamoDB.DocumentClient", "query", mockResponse);

	// Create the AWS service *after* the service method has been mocked
	const docClient = new AWS.DynamoDB.DocumentClient({
		region: awsRegion
	});

	const result = await getChildren(docClient, tableName, albumId);
	expect(result).toBeDefined();
	expect(result[0]).toBeDefined();
	expect(result[0].albumID).toBeDefined();
	expect(result[0].albumID).toBe("/2001/12-31");
	expect(result[0].uploadTimeStamp).toBe(1541787209);
	AWS_MOCK.restore("DynamoDB.DocumentClient");
});
