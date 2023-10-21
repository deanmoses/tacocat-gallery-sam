/**
 * @param {String} s
 * @returns true if string is one of the empty values that DynamoDB can't save,
 * like is undefined, null or empty: any
 */
export function isEmpty(s : string) : boolean {
	return s === undefined || s === null || s === "";
}