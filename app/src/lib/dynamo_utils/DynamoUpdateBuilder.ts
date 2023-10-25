import { isEmpty } from './isEmpty';

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
export class DynamoUpdateBuilder {
    private itemsToSet = new Map<string, string | boolean>();
    private itemsToSetIfNotExists = new Map<string, string | boolean>();
    /**
     * We'll be separating out the attributes to remove from the attributes to
     * update, because DynamoDB doesn't allow setting an attribute to
     * blank (""); instead, you have to remove it completely.
     *
     * Actually, as of 2020, DynamoDB has supported empty string values for
     * non-key attributes.  TODO: figure out whether I should use that
     * capability.
     */
    private itemsToRemove = new Set<string>();
    private setsToUpdate = new Map<string, string | boolean>();
    private attrValues = new Map<string, string | boolean>();
    private setStrings: string[] = [];

    /**
     * Set this field in DynamoDB.
     * This will result in an UpdateExpression like "SET foo = :foo"
     * If the value is blank/undefined, it instead results in DELETE foo
     *
     * @param name name of field
     * @param value value of field
     */
    add(name: string, value: string | boolean) {
        if (isEmpty(value)) {
            this.delete(name);
        } else {
            this.itemsToSet.set(name, value);
        }
    }

    /**
     * Set this field in DynamoDB.
     * This will result in an UpdateExpression like "SET name = :alias"
     * If the value is blank/undefined, it instead results in DELETE foo
     * @param name name of field
     * @param alias alias of field
     * @param value value of field
     */
    addAlias(name: string, alias: string, value: string | boolean) {
        if (isEmpty(value)) {
            this.delete(name);
        } else {
            this.setStrings.push(name + ' = :' + alias);
            this.addValue(alias, value);
        }
    }

    /**
     * Remove this field from DynamoDB.
     * This will result in an UpdateExpression like "REMOVE myAttr""
     *
     * @param name name of field
     */
    delete(name: string) {
        this.itemsToRemove.add(name);
    }

    /**
     * Set this field if it doesn't already exist in DynamoDB.
     * This will result in an UpdateExpression like "SET foo = if_not_exists(foo, :foo)"
     * If the value is blank/undefined, it isn't added to the command.
     *
     * @param name name of field
     * @param value value of field
     */
    setIfNotExists(name: string, value: string | boolean) {
        if (!isEmpty(value)) {
            this.itemsToSetIfNotExists.set(name, value);
        }
    }

    /**
     * Add the item to the set.
     * This will result in an UpdateExpression like "ADD nameOfSet :itemInSet"
     *
     * @param nameOfSetField name of set field
     * @param {Object} itemInSet item in set
     */
    // TODO: PORT TO TYPESCRIPT
    // addToSet(nameOfSetField: string, itemInSet: string) {
    //     if (this.setsToUpdate.get(nameOfSetField) === undefined) {
    //         this.setsToUpdate.set(nameOfSetField) = new Set();
    //     }
    //     this.setsToUpdate.get(nameOfSetField)
    //    //this.setsToUpdate[nameOfSetField].add(itemInSet);
    // }

    /**
     * Add a field to ExpressionAttributeValues.
     *
     * Most other methods on this class will also add a field to ExpressionAttributeValue
     * and thus you don't need to call this.  The only time you need to call this method
     * is to add a field to ExpressionAttributeValue that aren't used in the
     * UpdateExpression, such as if you have a ConditionExpression like this:
     * "attribute_exists (itemName) and thumbnail.path = :imagePath",
     */
    addValue(name: string, value: string | boolean) {
        this.attrValues.set(name, value);
    }

    /**
     * Construct the DynamoDB UpdateExpression
     *
     * @returns something like "SET attr1 = :attr1, REMOVE attr2"
     */
    getUpdateExpression(): string {
        // Build the SET
        let setExpr = '';
        for (const [name] of Object.entries(this.itemsToSetIfNotExists)) {
            setExpr = addToSetIfNotExistsExpr(setExpr, name);
        }
        for (const [name] of Object.entries(this.itemsToSet)) {
            setExpr = addToSetExpr(setExpr, name);
        }
        for (let i = 0; i < this.setStrings.length; i++) {
            setExpr = addExprToSetExpr(setExpr, this.setStrings[i]);
        }

        // Build the REMOVE
        let removeExpr = '';
        this.itemsToRemove.forEach((name) => {
            removeExpr = addToRemoveExpr(removeExpr, name);
        });

        // Build the ADD
        let addExpr = '';
        for (const [name] of Object.entries(this.setsToUpdate)) {
            addExpr = addToAddExpr(addExpr, name);
        }

        // Combine SET, REMOVE and ADD
        let updateExpression = '';
        if (setExpr) {
            updateExpression = setExpr;
        }
        if (removeExpr) {
            updateExpression += ' ' + removeExpr;
        }
        if (addExpr) {
            updateExpression += ' ' + addExpr;
        }
        return updateExpression;
    }

    /**
     * Construct the DyanmoDB ExpressionAttributeValues
     *
     * @returns {Object}
     */
    getExpressionAttributeValues() {
        const exprVals: Record<string, string | boolean> = {};
        for (const [name, value] of Object.entries(this.itemsToSetIfNotExists)) {
            exprVals[':' + name] = value;
        }
        for (const [name, value] of Object.entries(this.itemsToSet)) {
            exprVals[':' + name] = value;
        }
        // TODO: FINISH PORTING TO TYPESCRIPT
        // for (const [name, value] of Object.entries(this.setsToUpdate)) {
        //     exprVals[':' + name] = docClient.createSet(Array.from(value));
        // }
        for (const [name, value] of Object.entries(this.attrValues)) {
            exprVals[':' + name] = value;
        }
        return exprVals;
    }
}

/**
 * Add to DynamoDB SET expression
 */
function addToSetExpr(expr: string, name: string): string {
    if (expr.length === 0) {
        expr = 'SET';
    } else {
        expr += ',';
    }
    expr += ' z = :z'.replace(/z/g, name);
    return expr;
}

/**
 * Add to DynamoDB SET expression
 *
 * @param {String} expr
 * @param {String} s
 */
function addExprToSetExpr(expr: string, s: string): string {
    if (expr.length === 0) {
        expr = 'SET';
    } else {
        expr += ',';
    }
    expr += ' ' + s;
    return expr;
}

/**
 * Add to DynamoDB SET expression with an if_not_exists() qualifier
 */
function addToSetIfNotExistsExpr(expr: string, name: string): string {
    if (expr.length === 0) {
        expr = 'SET';
    } else {
        expr += ',';
    }
    expr += ' z = if_not_exists(z, :z)'.replace(/z/g, name);
    return expr;
}

/**
 * Add to DynamoDB REMOVE expression
 */
function addToRemoveExpr(expr: string, name: string): string {
    if (expr.length === 0) {
        expr = 'REMOVE';
    } else {
        expr += ',';
    }
    expr += ' ' + name;

    return expr;
}

/**
 * Add to DynamoDB ADD expression
 */
function addToAddExpr(expr: string, name: string): string {
    if (expr.length === 0) {
        expr = 'ADD';
    } else {
        expr += ',';
    }
    expr += ' z :z'.replace(/z/g, name);

    return expr;
}
