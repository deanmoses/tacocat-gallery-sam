import { shortHash, stableStringify } from './hash';

describe('stableStringify', () => {
    test('is independent of key order, at every level', () => {
        const a = { b: 1, a: { d: [{ y: 1, x: 2 }], c: 'x' } };
        const b = { a: { c: 'x', d: [{ x: 2, y: 1 }] }, b: 1 };
        expect(stableStringify(a)).toBe(stableStringify(b));
        expect(stableStringify(a)).toBe('{"a":{"c":"x","d":[{"x":2,"y":1}]},"b":1}');
    });

    test('keeps array order', () => {
        expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
    });

    test('drops undefined like JSON.stringify', () => {
        expect(stableStringify({ a: undefined, b: null })).toBe('{"b":null}');
    });
});

describe('shortHash', () => {
    test('is 16 lowercase hex characters and deterministic', () => {
        expect(shortHash('hello')).toMatch(/^[0-9a-f]{16}$/);
        expect(shortHash('hello')).toBe(shortHash('hello'));
        expect(shortHash('hello')).not.toBe(shortHash('hello!'));
    });
});
