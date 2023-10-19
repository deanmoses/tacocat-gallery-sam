const updateAlbum = require("./update_album.js");
const { BadRequestException } = require("http-response-utils");
const JestUtils = require("../../../tests/utils/JestUtils.js");

const albumPath = "/2001/12-31/";

// Execution context: stuff passed in to updateAlbum(ctx, ...)
// Created in beforeEach()
let ctx;

//
// TEST SETUP AND TEARDOWN
//

beforeEach(() => {
	// Mock out an execution context to be passed into updateAlbum(ctx, ...)
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

describe("Update Album", () => {
	test("title", async () => {
		expect.assertions(13);
		const newTitle = "New Title 1";

		// mock out doUpdate()
		const mockDoUpdate = jest.fn(q => {
			// do some expects *inside* the mocked function
			expect(q).toBeDefined();
			expect(q.TableName).toBe(ctx.tableName);
			expect(q.Key.parentPath).toBe("/2001/");
			expect(q.Key.itemName).toBe("12-31");
			expect(q.UpdateExpression).toBe(
				"SET updatedOn = :updatedOn, title = :title"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(2);
			expect(q.ExpressionAttributeValues[":title"]).toBe(newTitle);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;

		// do the update
		let result = await updateAlbum(ctx, albumPath, {
			title: newTitle
		});

		// did the mock update get called?
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
			expect(q.Key.parentPath).toBe("/2001/");
			expect(q.Key.itemName).toBe("12-31");
			expect(q.UpdateExpression).toBe(
				"SET updatedOn = :updatedOn REMOVE title"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(1);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateAlbum(ctx, albumPath, {
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
			expect(q.Key.parentPath).toBe("/2001/");
			expect(q.Key.itemName).toBe("12-31");
			expect(q.UpdateExpression).toBe(
				"SET updatedOn = :updatedOn, description = :description"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(2);
			expect(q.ExpressionAttributeValues[":description"]).toBe(newDescription);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateAlbum(ctx, albumPath, {
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
			expect(q.Key.parentPath).toBe("/2001/");
			expect(q.Key.itemName).toBe("12-31");
			expect(q.UpdateExpression).toBe(
				"SET updatedOn = :updatedOn REMOVE description"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(1);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateAlbum(ctx, albumPath, {
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
			expect(q.Key.parentPath).toBe("/2001/");
			expect(q.Key.itemName).toBe("12-31");
			expect(q.UpdateExpression).toBe(
				"SET updatedOn = :updatedOn, title = :title, description = :description"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(3);
			expect(q.ExpressionAttributeValues[":title"]).toBe(newTitle);
			expect(q.ExpressionAttributeValues[":description"]).toBe(newDescription);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateAlbum(ctx, albumPath, {
			title: newTitle,
			description: newDescription
		});
		expect(ctx.doUpdate).toBeCalledTimes(1);
		expect(result).toBeDefined();
		expect(Object.keys(result).length).toBe(0);
	});

	test("publishedn->true", async () => {
		expect.assertions(13);
		const newPublished = true;
		// mock out doUpdate()
		const mockDoUpdate = jest.fn(q => {
			// do some expects *inside* the mocked function
			expect(q).toBeDefined();
			expect(q.TableName).toBe(ctx.tableName);
			expect(q.Key.parentPath).toBe("/2001/");
			expect(q.Key.itemName).toBe("12-31");
			expect(q.UpdateExpression).toBe(
				"SET updatedOn = :updatedOn, published = :published"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(2);
			expect(q.ExpressionAttributeValues[":published"]).toBe(newPublished);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateAlbum(ctx, albumPath, {
			published: newPublished
		});
		expect(ctx.doUpdate).toBeCalledTimes(1);
		expect(result).toBeDefined();
		expect(Object.keys(result).length).toBe(0);
	});

	test("publishedn->false", async () => {
		expect.assertions(13);
		const newPublished = false;
		// mock out doUpdate()
		const mockDoUpdate = jest.fn(q => {
			// do some expects *inside* the mocked function
			expect(q).toBeDefined();
			expect(q.TableName).toBe(ctx.tableName);
			expect(q.Key.parentPath).toBe("/2001/");
			expect(q.Key.itemName).toBe("12-31");
			expect(q.UpdateExpression).toBe(
				"SET updatedOn = :updatedOn, published = :published"
			);
			expect(Object.keys(q.ExpressionAttributeValues).length).toBe(2);
			expect(q.ExpressionAttributeValues[":published"]).toBe(newPublished);
			JestUtils.expectValidDate(q.ExpressionAttributeValues[":updatedOn"]);
			expect(q.ConditionExpression).toBe("attribute_exists (itemName)");
			return {};
		});
		ctx.doUpdate = mockDoUpdate;
		let result = await updateAlbum(ctx, albumPath, {
			published: newPublished
		});
		expect(ctx.doUpdate).toBeCalledTimes(1);
		expect(result).toBeDefined();
		expect(Object.keys(result).length).toBe(0);
	});

	test("root album", async () => {
		expect.assertions(2);
		try {
			let q = await updateAlbum(ctx, "/", {
				title: "New Title"
			});
			throw ("Was not expecting success.  Got: ", q);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toMatch(/root/);
		}
	});

	test("empty data", async () => {
		expect.assertions(2);
		const attributesToUpdate = {};
		try {
			let result = await updateAlbum(ctx, albumPath, attributesToUpdate);
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toMatch(/No attributes/);
		}
	});

	test("null data", async () => {
		expect.assertions(2);
		const attributesToUpdate = null;
		try {
			let result = await updateAlbum(ctx, albumPath, attributesToUpdate);
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toMatch(/No attributes/);
		}
	});

	test("only bad data", async () => {
		expect.assertions(2);
		try {
			let result = await updateAlbum(ctx, albumPath, {
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
			let result = await updateAlbum(ctx, albumPath, {
				title: "New Title 3",
				noSuchAttribute: "some value"
			});
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toContain("noSuchAttribute");
		}
	});

	test("Invalid published value: true", async () => {
		expect.assertions(2);
		try {
			let result = await updateAlbum(ctx, albumPath, {
				published: "true"
			});
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toContain("published");
		}
	});

	test("Invalid published value: 1", async () => {
		expect.assertions(2);
		try {
			let result = await updateAlbum(ctx, albumPath, {
				published: 1
			});
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toContain("published");
		}
	});

	test("Blank published value", async () => {
		expect.assertions(2);
		try {
			let result = await updateAlbum(ctx, albumPath, {
				published: ""
			});
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toContain("published");
		}
	});

	test("Numerical published value", async () => {
		expect.assertions(2);
		try {
			let result = await updateAlbum(ctx, albumPath, {
				published: "0"
			});
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toContain("published");
		}
	});

	test("Missing albumPath", async () => {
		expect.assertions(2);
		try {
			let result = await updateAlbum(ctx, null /*no album*/, {
				title: "New Title 3"
			});
			throw ("Was not expecting success.  Got: ", result);
		} catch (e) {
			expect(e).toBeInstanceOf(BadRequestException); // Expect this error
			expect(e.message).toContain("album");
		}
	});
});
