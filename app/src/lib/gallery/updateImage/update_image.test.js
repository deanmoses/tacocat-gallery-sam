const updateImage = require("./update_image.js");
const { BadRequestException } = require("http-response-utils");
const JestUtils = require("../../../tests/utils/JestUtils.js");

const imagePath = "/2001/12-31/image.jpg";

// Execution context: stuff passed in to updateImage(ctx, ...)
// Created in beforeEach()
let ctx;

//
// TEST SETUP AND TEARDOWN
//

beforeEach(() => {
	// Mock out an execution context to be passed into updateImage(ctx, ...)
	ctx = {};

	// Fake DynamoDB table name goes into execution context
	ctx.tableName = "NotARealTableName";

	// A mock doUpdate function goes into execution context
	const mockDoUpdate = jest.fn();
	mockDoUpdate.mockReturnValue({}); // Will return empty object {}
	ctx.doUpdate = mockDoUpdate;
});

//
// TESTS
//

describe("Update Image", () => {
	test("title", async () => {
		expect.assertions(13);
		const newTitle = "New Title 1";
		// mock out doUpdate()
		const mockDoUpdate = jest.fn(q => {
			// do some expects *inside* the mocked function
			expect(q).toBeDefined();
			expect(q.TableName).toBe(ctx.tableName);
			expect(q.Key.parentPath).toBe("/2001/12-31/");
			expect(q.Key.itemName).toBe("image.jpg");
			expect(q.UpdateExpression).toBe(
				"SET title = :title, updatedOn = :updatedOn"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(2);
			expect(q.ExpressionAttributeValues[":title"]).toBe(newTitle);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateImage(ctx, imagePath, {
			title: newTitle
		});
		expect(ctx.doUpdate).toBeCalledTimes(1);
		expect(result).toBeDefined();
		expect(Object.keys(result).length).toBe(0);
	});

	test("blank title (unset title)", async () => {
		expect.assertions(12);
		const newTitle = "";
		// mock out doUpdate()
		const mockDoUpdate = jest.fn(q => {
			// do some expects *inside* the mocked function
			expect(q).toBeDefined();
			expect(q.TableName).toBe(ctx.tableName);
			expect(q.Key.parentPath).toBe("/2001/12-31/");
			expect(q.Key.itemName).toBe("image.jpg");
			expect(q.UpdateExpression).toBe(
				"SET updatedOn = :updatedOn REMOVE title"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(1);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateImage(ctx, imagePath, {
			title: newTitle
		});
		expect(ctx.doUpdate).toBeCalledTimes(1);
		expect(result).toBeDefined();
		expect(Object.keys(result).length).toBe(0);
	});

	test("description", async () => {
		expect.assertions(13);
		const newDescription = "New Description 1";
		// mock out doUpdate()
		const mockDoUpdate = jest.fn(q => {
			// do some expects *inside* the mocked function
			expect(q).toBeDefined();
			expect(q.TableName).toBe(ctx.tableName);
			expect(q.Key.parentPath).toBe("/2001/12-31/");
			expect(q.Key.itemName).toBe("image.jpg");
			expect(q.UpdateExpression).toBe(
				"SET description = :description, updatedOn = :updatedOn"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(2);
			expect(q.ExpressionAttributeValues[":description"]).toBe(newDescription);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateImage(ctx, imagePath, {
			description: newDescription
		});
		expect(ctx.doUpdate).toBeCalledTimes(1);
		expect(result).toBeDefined();
		expect(Object.keys(result).length).toBe(0);
	});

	test("blank description (unset description)", async () => {
		expect.assertions(12);
		const newDescription = "";
		// mock out doUpdate()
		const mockDoUpdate = jest.fn(q => {
			// do some expects *inside* the mocked function
			expect(q).toBeDefined();
			expect(q.TableName).toBe(ctx.tableName);
			expect(q.Key.parentPath).toBe("/2001/12-31/");
			expect(q.Key.itemName).toBe("image.jpg");
			expect(q.UpdateExpression).toBe(
				"SET updatedOn = :updatedOn REMOVE description"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(1);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateImage(ctx, imagePath, {
			description: newDescription
		});
		expect(ctx.doUpdate).toBeCalledTimes(1);
		expect(result).toBeDefined();
		expect(Object.keys(result).length).toBe(0);
	});

	test("title and description", async () => {
		expect.assertions(14);
		const newTitle = "New Title 2";
		const newDescription = "New Description 2";
		// mock out doUpdate()
		const mockDoUpdate = jest.fn(q => {
			// do some expects *inside* the mocked function
			expect(q).toBeDefined();
			expect(q.TableName).toBe(ctx.tableName);
			expect(q.Key.parentPath).toBe("/2001/12-31/");
			expect(q.Key.itemName).toBe("image.jpg");
			expect(q.UpdateExpression).toBe(
				"SET title = :title, description = :description, updatedOn = :updatedOn"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(3);
			expect(q.ExpressionAttributeValues[":title"]).toBe(newTitle);
			expect(q.ExpressionAttributeValues[":description"]).toBe(newDescription);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateImage(ctx, imagePath, {
			title: newTitle,
			description: newDescription
		});
		expect(ctx.doUpdate).toBeCalledTimes(1);
		expect(result).toBeDefined();
		expect(Object.keys(result).length).toBe(0);
	});

	test("empty data", async () => {
		expect.assertions(1);
		try {
			let result = await updateImage(ctx, imagePath, {});
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
		}
	});

	test("null data", async () => {
		expect.assertions(1);
		try {
			let result = await updateImage(ctx, imagePath, null);
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
		}
	});

	test("only bad data", async () => {
		expect.assertions(2);
		try {
			let result = await updateImage(ctx, imagePath, {
				noSuchAttribute: "some value"
			});
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toContain("noSuchAttribute");
		}
	});

	test("both real and bad data", async () => {
		expect.assertions(2);
		try {
			let result = await updateImage(ctx, imagePath, {
				title: "New Title 3",
				noSuchAttribute: "some value"
			});
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toContain("noSuchAttribute");
		}
	});

	test("Missing imagePath", async () => {
		expect.assertions(2);
		try {
			let result = await updateImage(ctx, null /*no image*/, {
				title: "New Title 3"
			});
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toContain("image");
		}
	});
});
