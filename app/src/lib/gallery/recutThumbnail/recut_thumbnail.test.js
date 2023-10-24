const recutThumbnail = require("./recut_thumbnail.js");
const JestUtils = require("../../../tests/utils/JestUtils.js");

//
// TEST SETUP AND TEARDOWN
//

let ctx;
let event;
beforeEach(() => {
	// Mock API Gateway event to be passed into the method being tested
	event = {
		path: "/thumb/2001/12-31/image.jpg",
		body: JSON.stringify({
			x: 30,
			y: 80,
			length: 500
		})
	};
	// Mock execution context to be passed into method being tested
	ctx = {
		tableName: "NotARealTableName"
	};
	// Mock doSaveThumbCrop()
	ctx.doSaveThumbCrop = jest.fn(dynamoParams => {
		expect(dynamoParams).toBeDefined();
		return doSaveThumbCropResponseWithAlbum;
	});
	// Mock generateThumb()
	ctx.generateThumb = jest.fn((imagePath, crop) => {
		expect(imagePath).toBeDefined();
		expect(crop).toBeDefined();
		return {};
	});
	// Mock doUpdateAlbumThumb()
	ctx.doUpdateAlbumThumb = jest.fn(dynamoParams => {
		expect(dynamoParams).toBeDefined();
		return true;
	});
});

describe("Recut Thumbnail", () => {
	describe("Input Error", () => {
		test("blank path", async () => {
			event.path = "";
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/path/);
		});

		test("blank body", async () => {
			event.body = "";
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/body/);
		});

		test("empty body", async () => {
			event.body = JSON.stringify({});
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/x:/);
		});
		test("missing x", async () => {
			event.body = JSON.stringify({ y: 0, length: 200 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/x:/);
		});
		test("missing y", async () => {
			event.body = JSON.stringify({ x: 0, length: 200 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/y:/);
		});
		test("missing length", async () => {
			event.body = JSON.stringify({ x: 0, y: 0 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/length:/);
		});
		test("blank x", async () => {
			event.body = JSON.stringify({ x: "", y: 0, length: 200 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/x:/);
		});

		test("negative x", async () => {
			event.body = JSON.stringify({ x: -1, y: 0, length: 200 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/x:/);
		});

		test("float x", async () => {
			event.body = JSON.stringify({ x: 1.1, y: 0, length: 200 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/x:/);
		});

		test("non-number x", async () => {
			event.body = JSON.stringify({ x: "asdf", y: 0, length: 200 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/x:/);
		});

		test("float non-number x", async () => {
			event.body = JSON.stringify({ x: "1.1", y: 0, length: 200 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/x:/);
		});

		test("string integer x", async () => {
			event.body = JSON.stringify({ x: "1", y: "wrong", length: 200 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/y:/);
		});

		test("string zero x", async () => {
			event.body = JSON.stringify({ x: "0", y: "wrong", length: 200 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/y:/);
		});

		test("string integer x", async () => {
			event.body = JSON.stringify({ x: 0, y: "wrong", length: 200 });
			await expect(recutThumbnail(event, ctx)).rejects.toThrow(/y:/);
		});
	});

	describe("Valid Input", () => {
		/**
		 *
		 */
		test("Save Crop", async () => {
			expect.assertions(20);

			// mock out doSaveThumbCrop()
			ctx.doSaveThumbCrop = jest.fn(q => {
				// do some expects *inside* the mocked function
				expect(q).toBeDefined();
				expect(q.TableName).toBe(ctx.tableName);
				expect(q.Key.parentPath).toBe("/2001/12-31/");
				expect(q.Key.itemName).toBe("image.jpg");
				expect(q.UpdateExpression).toBe(
					"SET updatedOn = :updatedOn, thumbnail = :thumbnail"
				);
				expect(Object.keys(q.ExpressionAttributeValues).length).toBe(2);
				JestUtils.expectValidDate(
					q.ExpressionAttributeValues[":thumbnail"].fileUpdatedOn
				);
				JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
				expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
				return doSaveThumbCropResponse;
			});

			// do the update
			const response = await recutThumbnail(event, ctx);

			// is the response what I expected?
			expect(response).toBeDefined();
			const body = JSON.parse(response.body);
			expect(body.errorMessage).toBeUndefined();
			expect(body.successMessage).toMatch("image.jpg");
			expect(response.statusCode).toBe(200);

			// did the expected mocks get called?
			expect(ctx.generateThumb).toBeCalledTimes(1);
			expect(ctx.doSaveThumbCrop).toBeCalledTimes(1);
			expect(ctx.doUpdateAlbumThumb).toBeCalledTimes(0);
		});

		/**
		 *
		 */
		test("Save Crop For Album Thumbnail", async () => {
			expect.assertions(30);

			// mock out doSaveThumbCrop()
			ctx.doSaveThumbCrop = jest.fn(q => {
				// do some expects *inside* the mocked function
				expect(q).toBeDefined();
				expect(q.TableName).toBe(ctx.tableName);
				expect(q.Key.parentPath).toBe("/2001/12-31/");
				expect(q.Key.itemName).toBe("image.jpg");
				expect(q.UpdateExpression).toBe(
					"SET updatedOn = :updatedOn, thumbnail = :thumbnail"
				);
				expect(Object.keys(q.ExpressionAttributeValues).length).toBe(2);
				JestUtils.expectValidDate(
					q.ExpressionAttributeValues[":thumbnail"].fileUpdatedOn
				);
				JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
				expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
				return doSaveThumbCropResponseWithAlbum;
			});

			// mock out doUpdateAlbumThumb()
			ctx.doUpdateAlbumThumb = jest.fn(q => {
				// do some expects *inside* the mocked function
				expect(q).toBeDefined();
				expect(q.Key.parentPath).toBe("/2018/");
				expect(q.Key.itemName).toBe("01-24");
				expect(q.ConditionExpression).toBe(
					"attribute_exists (itemName) and thumbnail.path = :imagePath"
				);
				expect(q.UpdateExpression).toBe(
					"SET updatedOn = :updatedOn, thumbnail.fileUpdatedOn = :thumbUpdatedOn"
				);
				expect(Object.keys(q.ExpressionAttributeValues).length).toBe(3);
				JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
				expect(q.ExpressionAttributeValues[":imagePath"]).toBe(
					"/2001/12-31/image.jpg"
				);
				JestUtils.expectValidDate(
					q.ExpressionAttributeValues[":thumbUpdatedOn"]
				);
				return true;
			});

			// do the update
			const response = await recutThumbnail(event, ctx);

			expect(response).toBeDefined();
			const body = JSON.parse(response.body);
			expect(body.successMessage).toMatch(albumPath);
			expect(response.statusCode).toBe(200);

			// did the expected mocks get called?
			expect(ctx.generateThumb).toBeCalledTimes(1);
			expect(ctx.doSaveThumbCrop).toBeCalledTimes(1);
			expect(ctx.doUpdateAlbumThumb).toBeCalledTimes(1);
		});
	});
});

const doSaveThumbCropResponse = {
	Attributes: {}
};

const albumPath = "/2018/01-24/";

const doSaveThumbCropResponseWithAlbum = {
	Attributes: {
		thumbForAlbums: {
			values: [albumPath]
		}
	}
};
