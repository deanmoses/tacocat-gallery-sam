const setAlbumThumbnail = require("./set_album_thumbnail.js");
const JestUtils = require("../../../tests/utils/JestUtils.js");

//
// TEST SETUP AND TEARDOWN
//

let ctx;
let event;
beforeEach(() => {
	// Mock API Gateway event to be passed into the method being tested
	event = {
		path: "/album-thumb/2001/12-31/",
		body: JSON.stringify({ imagePath: "/2001/12-31/image.jpg" })
	};
	// Mock execution context to be passed into method being tested
	ctx = {
		tableName: "NotARealTableName"
	};
	// Mock doGetImage()
	ctx.doGetImage = jest.fn(dynamoParams => {
		expect(dynamoParams).toBeDefined();
		return { Item: { fileUpdatedOn: "2019-03-03T06:36:28.801Z" } };
	});

	// Mock doTransaction()
	ctx.doTransaction = jest.fn(dynamoParams => {
		expect(dynamoParams).toBeDefined();
		return true;
	});
});

describe("Recut Thumbnail", () => {
	describe("Input Error", () => {
		test("blank path", async () => {
			event.path = "";
			await expect(setAlbumThumbnail(event, ctx)).rejects.toThrow(/path/);
		});

		test("blank body", async () => {
			event.body = "";
			await expect(setAlbumThumbnail(event, ctx)).rejects.toThrow(/body/);
		});

		test("empty JSON body", async () => {
			event.body = JSON.stringify({});
			await expect(setAlbumThumbnail(event, ctx)).rejects.toThrow(/imagePath/);
		});
		test("malformed image path", async () => {
			event.body = JSON.stringify({ imagePath: "/2001/12-31/" });
			await expect(setAlbumThumbnail(event, ctx)).rejects.toThrow(/malformed/i);
		});
	});

	describe("Valid Input", () => {
		/**
		 *
		 */
		test("Basic success path", async () => {
			expect.assertions(8);

			// do the update
			const response = await setAlbumThumbnail(event, ctx);

			// is the response what I expected?
			expect(response).toBeDefined();
			const body = JSON.parse(response.body);
			expect(body.errorMessage).toBeUndefined();
			expect(body.message).toBe(
				"Album /2001/12-31/ thumbnail set to /2001/12-31/image.jpg"
			);
			expect(response.statusCode).toBe(200);

			// did the expected mocks get called?
			expect(ctx.doGetImage).toBeCalledTimes(1);
			expect(ctx.doTransaction).toBeCalledTimes(1);
		});
	});
});
