import { buildUpdatePartiQL } from './DynamoUpdateBuilder';

describe('buildUpdateSql', () => {
    let attrs: Record<string, string | boolean>;

    test('string', () => {
        expect.assertions(1);
        attrs = { title: 'someTitle' };
        expect(buildUpdatePartiQL('someTableName', '/', '2001', attrs)).toBe(
            `UPDATE "someTableName"\nSET title='someTitle'\nWHERE parentPath='/' AND itemName='2001'`,
        );
    });

    test('boolean', () => {
        expect.assertions(1);
        attrs = { title: 'Title 2', published: true };
        expect(buildUpdatePartiQL('someTableName', '/2020', '12-31', attrs)).toBe(
            `UPDATE "someTableName"\nSET title='Title 2'\nSET published=true\nWHERE parentPath='/2020' AND itemName='12-31'`,
        );
    });
    test('datestring', () => {
        expect.assertions(1);
        attrs = { description: 'Desc 2', updatedOn: new Date().toISOString() };
        expect(buildUpdatePartiQL('someTableName', '/2020', '12-31', attrs)).toBe(
            `UPDATE "someTableName"\nSET description='Desc 2'\nSET updatedOn='${attrs.updatedOn}'\nWHERE parentPath='/2020' AND itemName='12-31'`,
        );
    });
});
