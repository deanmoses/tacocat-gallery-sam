import { isValidAlbumPath, isValidImagePath } from './pathValidator';

describe('isValidAlbumPath', () => {
    const invalidAlbumPaths = [
        '',
        'notapath',
        '/not/a/real/path',
        '//',
        '/1/',
        '/10/',
        '/200/',
        '/2001',
        '2001',
        '12-31',
        '/12-31',
        '2001/12-31',
        '/2001/12-31',
        '/2001/12 31/',
        '/2001/12_31/',
        '/2001/1231/',
        '/2001/12-32/',
        '/2001/13-01/',
        '/2001/20-01/',
        '/2001/12-200/',
        '/2001/12-31/something',
        '/2001/12-31/something/',
    ];
    invalidAlbumPaths.forEach((path) => {
        it(`Path should be invalid: [${path}]`, () => {
            expect(isValidAlbumPath(path)).toStrictEqual(false);
        });
    });

    const validAlbumPaths = [
        '/',
        '/2001/',
        '/2018/',
        '/2029/',
        '/2030/01-01/',
        '/2001/01-09/',
        '/2001/01-11/',
        '/2018/01-24/',
        '/2001/12-31/',
    ];
    validAlbumPaths.forEach((path) => {
        it(`Path should be valid: [${path}]`, () => {
            expect(isValidAlbumPath(path)).toStrictEqual(true);
        });
    });
});

describe('isValidImagePath', () => {
    const invalidImagePaths = [
        '',
        'notapath',
        '/not/a/real/path',
        '/',
        '//',
        '/1/',
        '/10/',
        '/200/',
        '/2001',
        '/2001/',
        '2001',
        '12-31',
        '/12-31',
        '2001/12-31',
        '/2001/12-31',
        '/2001/12 31/',
        '/2001/12_31/',
        '/2001/1231/',
        '/2001/12-31/',
        '/2001/12-32/',
        '/2018/01-24/',
        '/2001/13-01/',
        '/2001/20-01/',
        '/2001/12-200/',
        '/2001/12-31/something',
        '/2001/12-31/something/',
        'image.jpg',
        '/image.jpg',
        '12-31/image.jpg',
        '2001/12-31/image.jpg',
        '/2001/12-31/.jpg',
        '/2001/12-31/image.',
        '/2001/12-31/image',
        '/2001/12-31/image/jpg',
        '/2001/12-31/image/',
        '/2001/13-31/image.jpg',
        '/2001/12-32/image.jpg',
        '/2001/1231/image.jpg',
        '//2001/12-31/image.jpg',
        '/2001/image.jpg',
        '/image.jpg',
        '/2001/12-31/..jpg',
        '/2001/12-31/@.jpg',
        '/2001/12-31/$.jpg',
        '/2001/12-31/#.jpg',
        '/2001/12-31/*.jpg',
        '/2001/12-31/&.jpg',
        '/2001/12-31/ .jpg',
        '/2001/12-31/a a.jpg',
        '/2001/12-31/a .jpg',
        '/2001/12-31/?.jpg',
        '/2001/12-31/%.jpg',
        '/2001/12-31/image.jpg ',
        ' /2001/12-31/image.jpg',
        '/2001/12-31/ image.jpg',
        '/2001/12-31/image .jpg',
        '/2001/12-31/image. jpg',
        '/2001/12-31/ima ge.jpg',
        '/2001/12-31/image.jpg1',
    ];
    invalidImagePaths.forEach((path) => {
        it(`Path should be invalid: [${path}]`, () => {
            expect(isValidImagePath(path)).toStrictEqual(false);
        });
    });

    const validImagePaths = [
        '/2001/12-31/image.jpg',
        '/2001/12-31/i.jpg',
        '/2001/12-31/i-1.jpg',
        '/2001/12-31/i_1.jpg',
        '/2001/12-31/1.jpg',
        '/2001/12-31/image.jpg',
        '/2001/12-31/image.jpg',
        '/3000/01-01/IMAGE.JPG',
        '/2001/12-31/image.jpeg',
        '/2001/12-31/image.JPEG',
        '/2001/12-31/image.png',
        '/2001/12-31/image.PNG',
        '/2001/12-31/image.gif',
        '/2001/12-31/image.GIF',
    ];
    validImagePaths.forEach((path) => {
        it(`Path should be valid: [${path}]`, () => {
            expect(isValidImagePath(path)).toStrictEqual(true);
        });
    });
});
