import { APIGatewayProxyEvent } from 'aws-lambda';
import {
    getBodyAsAttributes,
    getBodyAsObject,
    getBodyAsStringArray,
    getNumberField,
    getStringArrayField,
    getStringField,
} from './ApiGatewayRequestHelpers';
import { BadRequestException } from './BadRequestException';

function eventWithBody(body: string | null): APIGatewayProxyEvent {
    return {
        body,
        headers: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as APIGatewayProxyEvent['requestContext'],
        resource: '',
        multiValueHeaders: {},
    };
}

describe('getBodyAsObject()', () => {
    it('parses a JSON object', () => {
        expect(getBodyAsObject(eventWithBody('{"newName":"felix.jpg"}'))).toEqual({ newName: 'felix.jpg' });
    });

    it.each([
        ['no body', null],
        ['empty body', ''],
        ['malformed JSON', '{not json'],
        ['a JSON array', '["felix.jpg"]'],
        ['a JSON string', '"felix.jpg"'],
        ['JSON null', 'null'],
    ])('rejects %s', (_label, body) => {
        expect(() => getBodyAsObject(eventWithBody(body))).toThrow(BadRequestException);
    });
});

describe('getBodyAsStringArray()', () => {
    it('parses an array of strings', () => {
        expect(getBodyAsStringArray(eventWithBody('["/2001/12-31/felix.jpg"]'))).toEqual(['/2001/12-31/felix.jpg']);
    });

    it.each([
        ['a JSON object', '{"paths":[]}'],
        ['an array containing a number', '["a",1]'],
        ['malformed JSON', '[oops'],
    ])('rejects %s', (_label, body) => {
        expect(() => getBodyAsStringArray(eventWithBody(body))).toThrow(BadRequestException);
    });
});

describe('getBodyAsAttributes()', () => {
    it('accepts strings and booleans', () => {
        expect(getBodyAsAttributes(eventWithBody('{"description":"Felix","published":true}'))).toEqual({
            description: 'Felix',
            published: true,
        });
    });

    it.each([
        ['a nested object', '{"description":{"a":1}}'],
        ['an array value', '{"description":["a"]}'],
        ['a number value', '{"description":1}'],
        ['a null value', '{"description":null}'],
    ])('rejects %s', (_label, body) => {
        expect(() => getBodyAsAttributes(eventWithBody(body))).toThrow(BadRequestException);
    });
});

describe('getStringField()', () => {
    it('returns the string', () => {
        expect(getStringField({ newName: 'felix.jpg' }, 'newName')).toBe('felix.jpg');
    });

    it.each([
        ['missing', {}],
        ['not a string', { newName: 7 }],
        ['null', { newName: null }],
    ])('rejects a field that is %s', (_label, body) => {
        expect(() => getStringField(body, 'newName')).toThrow(BadRequestException);
    });
});

describe('getNumberField()', () => {
    it('returns the number', () => {
        expect(getNumberField({ x: 12.5 }, 'x')).toBe(12.5);
    });

    it.each([
        ['missing', {}],
        ['a numeric string', { x: '12.5' }],
        ['NaN', { x: NaN }],
        ['Infinity', { x: Infinity }],
    ])('rejects a field that is %s', (_label, body) => {
        expect(() => getNumberField(body, 'x')).toThrow(BadRequestException);
    });
});

describe('getStringArrayField()', () => {
    it('returns the array', () => {
        expect(getStringArrayField({ paths: ['/2001/'] }, 'paths')).toEqual(['/2001/']);
    });

    it.each([
        ['missing', {}],
        ['not an array', { paths: '/2001/' }],
        ['an array of numbers', { paths: [1] }],
    ])('rejects a field that is %s', (_label, body) => {
        expect(() => getStringArrayField(body, 'paths')).toThrow(BadRequestException);
    });
});
