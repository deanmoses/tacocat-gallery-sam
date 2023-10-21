const getAlbumAndChildren = require("./get_album_and_children.js");
const AWS = require("aws-sdk");
const AWS_MOCK = require("aws-sdk-mock");

const awsRegion = "us-west-2";
const tableName = "NotARealTableName";

test("Get root album", async () => {
	expect.assertions(10);

	const albumPath = "";

	// Mock out the AWS 'query' method.  Used to return both the child images and the child albums
	const mockQueryResponse = {
		Items: mockItems,
		Count: 3,
		ScannedCount: 3
	};
	AWS_MOCK.mock("DynamoDB.DocumentClient", "query", mockQueryResponse);

	// Create the AWS service *after* the service method has been mocked
	const docClient = new AWS.DynamoDB.DocumentClient({
		region: awsRegion
	});

	const result = await getAlbumAndChildren(docClient, tableName, albumPath);
	expect(result).toBeDefined();

	const album = result.album;
	expect(album).toBeDefined();
	expect(album.title).toBe("Dean, Lucie, Felix and Milo Moses");
	expect(album.itemName).toBe("/");
	expect(album.parentPath).toBe("");

	const children = result.children;
	expect(children).toBeDefined();

	expect(children[0]).toBeDefined();
	expect(children[0].itemName).toBe("cross_country5.jpg");

	expect(children[1]).toBeDefined();
	expect(children[1].itemName).toBe("cross_country6.jpg");

	AWS_MOCK.restore("DynamoDB.DocumentClient");
});

test("Get Images in Album", async () => {
	expect.assertions(6);

	const albumId = "/not/a/real/album";

	// Mock out the AWS 'get' method
	const mockGetResponse = {
		Item: {
			itemName: "12-31",
			parentPath: "/2001/",
			updatedOn: "2001-12-31T23:59:59.999Z"
		}
	};
	AWS_MOCK.mock("DynamoDB.DocumentClient", "get", mockGetResponse);

	// Mock out the AWS 'query' method.  Used to return both the child images and the child albums
	const mockQueryResponse = {
		Items: mockItems,
		Count: 3,
		ScannedCount: 3
	};
	AWS_MOCK.mock("DynamoDB.DocumentClient", "query", mockQueryResponse);

	// Create the AWS service *after* the service method has been mocked
	const docClient = new AWS.DynamoDB.DocumentClient({
		region: awsRegion
	});

	const albumResponse = await getAlbumAndChildren(
		docClient,
		tableName,
		albumId
	);
	expect(albumResponse).toBeDefined();

	expect(albumResponse.children).toBeDefined();

	expect(albumResponse.children[0]).toBeDefined();
	expect(albumResponse.children[0].itemName).toBe("cross_country5.jpg");

	expect(albumResponse.children[1]).toBeDefined();
	expect(albumResponse.children[1].itemName).toBe("cross_country6.jpg");

	AWS_MOCK.restore("DynamoDB.DocumentClient");
});

const mockItems = [
	{
		itemName: "cross_country5.jpg",
		parentPath: "/2001/12-31",
		updatedOn: "2018:11:03 16:25:41",
		dimensions: { width: 4032, height: 3024 },
		tags: [
			"Person",
			"Human",
			"Clothing",
			"Shorts",
			"Crowd",
			"People",
			"Audience",
			"Festival",
			"Shoe",
			"Footwear"
		]
	},
	{
		itemName: "cross_country6.jpg",
		parentPath: "/2001/12-31",
		updatedOn: "2018:11:03 16:25:41",
		dimensions: { width: 4032, height: 3024 },
		tags: [
			"Person",
			"Clothing",
			"Electronics",
			"Sitting",
			"Furniture",
			"Table",
			"Photographer",
			"Tripod",
			"Desk",
			"Wood"
		]
	},
	{
		imageID: "2001/12-31/cross_country7.jpg",
		parentPath: "/2001/12-31",
		updatedOn: "2018:11:03 16:25:41",
		dimensions: { width: 4032, height: 3024 },
		tags: [
			"Person",
			"Human",
			"Sports",
			"Sport",
			"Cross Country",
			"People",
			"Crowd",
			"Apparel",
			"Clothing"
		]
	}
];
