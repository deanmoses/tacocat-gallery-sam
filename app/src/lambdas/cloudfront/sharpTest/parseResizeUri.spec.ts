import { parseResizeUri } from './parseResizeUri';

type testdata = {
    uri: string;
    expected: { width: number; height: number; format: string };
};

describe('valid paths', () => {
    const tests: testdata[] = [
        {
            uri: '/700|400|webp/image.jpg',
            expected: {
                width: 700,
                height: 400,
                format: 'webp',
            },
        },
        {
            uri: '/100|100/image.jpg',
            expected: {
                width: 100,
                height: 100,
                format: 'jpg',
            },
        },
    ];

    tests.forEach((test) => {
        it(`Path should be valid: [${test.uri}]`, () => {
            expect(parseResizeUri(test.uri)).toBe(test.expected);
        });
    });
});

describe('invalid paths', () => {
    const invalidPaths = ['/x|x|image.jpg'];

    invalidPaths.forEach((path) => {
        it(`Path should be invalid: [${path}]`, () => {
            expect(parseResizeUri(path)).toThrow();
        });
    });
});
