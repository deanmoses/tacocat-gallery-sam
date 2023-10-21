import { isEmpty } from './isEmpty';
import { AWS } from 'aws-sdk';

const docClient = new AWS.DynamoDB.DocumentClient(); // just needed for constructing the set parameter correctly

/**
 * Helps build a DynamoDB UpdateItem statement.
 *
 * Usage:
 * const bldr = new DynamoUpdateBuilder();
 * bldr.add("attrToUpdate", valueOfAttr)
 * const dynamoParams = {
 *		TableName: ...,
 *		Key: {
 *			...
 *		},
 *		UpdateExpression: bldr.getUpdateExpression(),
 *		ExpressionAttributeValues: bldr.getExpressionAttributeValues()
 *	}
 */
class DynamoUpdateBuilder {
	constructor() {
		this.itemsToSet = {};
		this.itemsToSetIfNotExists = {};
		// We'll be separating out the attributes to remove from the attributes to
		// update.  Setting an attribute to blank ("") isn't allowed in DynamoDB;
		// instead you have to remove it completely.
		this.itemsToRemove = new Set();
		this.setsToUpdate = {};
		this.attrValues = {};
		this.setStrings = [];
	}

	/**
	 * Set this field in DynamoDB.
	 * This will result in an UpdateExpression like "SET foo = :foo"
	 * If the value is blank/undefined, it instead results in DELETE foo
	 *
	 * @param {String} name name of field
	 * @param {Object} value value of field
	 */
	add(name, value) {
		if (isEmpty(value)) {
			this.delete(name);
		} else {
			this.itemsToSet[name] = value;
		}
	}

	/**
	 * Set this field in DynamoDB.
	 * This will result in an UpdateExpression like "SET name = :alias"
	 * If the value is blank/undefined, it instead results in DELETE foo
	 * @param {String} name name of field
	 * @param {String} alias alias of field
	 * @param {Object} value value of field
	 */
	addAlias(name, alias, value) {
		if (isEmpty(value)) {
			this.delete(name);
		} else {
			this.setStrings.push(name + " = :" + alias);
			this.addValue(alias, value);
		}
	}

	/**
	 * Remove this field from DynamoDB.
	 * This will result in an UpdateExpression like "REMOVE myAttr""
	 *
	 * @param {String} name name of field
	 */
	delete(name) {
		this.itemsToRemove.add(name);
	}

	/**
	 * Set this field if it doesn't already exist in DynamoDB.
	 * This will result in an UpdateExpression like "SET foo = if_not_exists(foo, :foo)"
	 * If the value is blank/undefined, it isn't added to the command.
	 *
	 * @param {String} name name of field
	 * @param {Object} value value of field
	 */
	setIfNotExists(name, value) {
		if (!isEmpty(value)) {
			this.itemsToSetIfNotExists[name] = value;
		}
	}

	/**
	 * Add the item to the set.
	 * This will result in an UpdateExpression like "ADD nameOfSet :itemInSet"
	 *
	 * @param {String} nameOfSetField name of set field
	 * @param {Object} itemInSet item in set
	 */
	addToSet(nameOfSetField, itemInSet) {
		if (this.setsToUpdate[nameOfSetField] == undefined) {
			this.setsToUpdate[nameOfSetField] = new Set();
		}
		this.setsToUpdate[nameOfSetField].add(itemInSet);
	}

	/**
	 * Add a field to ExpressionAttributeValues.
	 *
	 * Most other methods on this class will also add a field to ExpressionAttributeValue
	 * and thus you don't need to call this.  The only time you need to call this method
	 * is to add a field to ExpressionAttributeValue that aren't used in the
	 * UpdateExpression, such as if you have a ConditionExpression like this:
	 * "attribute_exists (itemName) and thumbnail.path = :imagePath",
	 */
	addValue(name, value) {
		this.attrValues[name] = value;
	}

	/**
	 * Construct the DynamoDB UpdateExpression
	 *
	 * @returns {String} such as "SET attr1 = :attr1, REMOVE attr2"
	 */
	getUpdateExpression() {
		// Build the SET
		let setExpr = "";
		for (const [name, value] of Object.entries(this.itemsToSetIfNotExists)) {
			setExpr = addToSetIfNotExistsExpr(setExpr, name, value);
		}
		for (const [name, value] of Object.entries(this.itemsToSet)) {
			setExpr = addToSetExpr(setExpr, name, value);
		}
		for (let i = 0; i < this.setStrings.length; i++) {
			setExpr = addExprToSetExpr(setExpr, this.setStrings[i]);
		}

		// Build the REMOVE
		let removeExpr = "";
		this.itemsToRemove.forEach(name => {
			removeExpr = addToRemoveExpr(removeExpr, name);
		});

		// Build the ADD
		let addExpr = "";
		for (const [name, value] of Object.entries(this.setsToUpdate)) {
			addExpr = addToAddExpr(addExpr, name, value);
		}

		// Combine SET, REMOVE and ADD
		let updateExpression = "";
		if (setExpr) {
			updateExpression = setExpr;
		}
		if (removeExpr) {
			updateExpression += " " + removeExpr;
		}
		if (addExpr) {
			updateExpression += " " + addExpr;
		}
		return updateExpression;
	}

	/**
	 * Construct the DyanmoDB ExpressionAttributeValues
	 *
	 * @returns {Object}
	 */
	getExpressionAttributeValues() {
		let exprVals = {};
		for (const [name, value] of Object.entries(this.itemsToSetIfNotExists)) {
			exprVals[":" + name] = value;
		}
		for (const [name, value] of Object.entries(this.itemsToSet)) {
			exprVals[":" + name] = value;
		}
		for (const [name, value] of Object.entries(this.setsToUpdate)) {
			exprVals[":" + name] = docClient.createSet(Array.from(value));
		}
		for (const [name, value] of Object.entries(this.attrValues)) {
			exprVals[":" + name] = value;
		}
		return exprVals;
	}
}
module.exports = DynamoUpdateBuilder;

/**
 * Add to DynamoDB SET expression
 *
 * @param {String} expr
 * @param {String} name
 */
function addToSetExpr(expr, name) {
	if (expr.length === 0) {
		expr = "SET";
	} else {
		expr += ",";
	}
	expr += " z = :z".replace(/z/g, name);
	return expr;
}

/**
 * Add to DynamoDB SET expression
 *
 * @param {String} expr
 * @param {String} s
 */
function addExprToSetExpr(expr, s) {
	if (expr.length === 0) {
		expr = "SET";
	} else {
		expr += ",";
	}
	expr += " " + s;
	return expr;
}

/**
 * Add to DynamoDB SET expression with an if_not_exists() qualifier
 *
 * @param {String} expr
 * @param {String} name
 */
function addToSetIfNotExistsExpr(expr, name) {
	if (expr.length === 0) {
		expr = "SET";
	} else {
		expr += ",";
	}
	expr += " z = if_not_exists(z, :z)".replace(/z/g, name);
	return expr;
}

/**
 * Add to DynamoDB REMOVE expression
 *
 * @param {String} expr
 * @param {String} name
 */
function addToRemoveExpr(expr, name) {
	if (expr.length === 0) {
		expr = "REMOVE";
	} else {
		expr += ",";
	}
	expr += " " + name;

	return expr;
}

/**
 * Add to DynamoDB ADD expression
 *
 * @param {String} expr
 * @param {String} name
 */
function addToAddExpr(expr, name) {
	if (expr.length === 0) {
		expr = "ADD";
	} else {
		expr += ",";
	}
	expr += " z :z".replace(/z/g, name);

	return expr;
}
