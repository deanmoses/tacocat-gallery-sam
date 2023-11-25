import { AlbumItem } from '../gallery/galleryTypes';

/**
 * Generate a DynamoDB PartiSQL update string
 *
 * @param tableName name of DynamoDB table
 * @param parentPath path of parent album
 * @param itemName name of item
 * @param fields fields to update
 *
 * @returns PartiQL statement like 'UPDATE ... WHERE ...'
 */
export function buildUpdatePartiQL(
    tableName: string,
    parentPath: string,
    itemName: string,
    fields: Partial<AlbumItem>,
): string {
    let sql = `UPDATE "${tableName}"\n`;
    Object.entries(fields).forEach(([fieldName, fieldValue]) => {
        //if fields are a map: fields.forEach((fieldName, fieldValue) => {
        sql += `SET ${fieldName}=${val(fieldValue)}\n`;
    });
    sql += `WHERE parentPath='${parentPath}' AND itemName='${itemName}'`;
    return sql;
}

/**
 * PartiQL wants strings to be quoted but booleans not
 */
function val(value: unknown): string | boolean {
    switch (typeof value) {
        case 'boolean':
            return value;
        case 'string':
            let s = value as string;
            s = s.replaceAll("'", "''"); // single quotes need to be escaped with another single quotes (!)
            return `'${s}'`;
        default:
            throw `Unknown data type in PartiQL update statement: [${typeof value}]`;
    }
}
