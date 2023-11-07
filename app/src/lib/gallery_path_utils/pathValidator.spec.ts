import {
    isValidAlbumPath,
    isValidImageName,
    isValidImageNameStrict,
    isValidImagePath,
    isValidYearAlbumPath,
    sanitizeImageName,
} from './pathValidator';

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
        it(`Should be invalid: [${path}]`, () => {
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
        it(`Should be valid: [${path}]`, () => {
            expect(isValidAlbumPath(path)).toStrictEqual(true);
        });
    });
});

describe('isValidYearAlbumPath', () => {
    const invalidYearAlbumPaths = [
        '',
        '/', // root
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
        '/2030/01-01/', // week
        '/2001/01-09/', // week
        '/2001/01-11/', // week
        '/2018/01-24/', // week
        '/2001/12-31/', // week
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
    invalidYearAlbumPaths.forEach((path) => {
        it(`Should be invalid: [${path}]`, () => {
            expect(isValidYearAlbumPath(path)).toStrictEqual(false);
        });
    });

    const validYearAlbumPaths = ['/2001/', '/2018/', '/2029/'];
    validYearAlbumPaths.forEach((path) => {
        it(`Should be valid: [${path}]`, () => {
            expect(isValidYearAlbumPath(path)).toStrictEqual(true);
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
        it(`Should be invalid: [${path}]`, () => {
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
        it(`Should be valid: [${path}]`, () => {
            expect(isValidImagePath(path)).toStrictEqual(true);
        });
    });
});

describe('isValidImageName', () => {
    const invalidImageNames = [
        '',
        '/',
        'adf',
        '2000',
        '/2000',
        '2000/',
        '/2000/',
        '2000/12-31',
        '/2000/12-31/',
        '2000/12-31/image.jpg',
        '/2000/12-31/image.jpg',
        '/2000/12-31/image',
        'newName.pdf',
        'newName.heic',
        'newName.jpg ', // space at end
        ' newName.jpg', // space at beginning
        '/newName.jpg',
        'newName.',
        'newName',
        '.jpg',
        'a^b.jpg',
        'a b.jpg',
    ];
    invalidImageNames.forEach((imageName) => {
        test(`Should be invalid: [${imageName}]`, async () => {
            expect(isValidImageName(imageName)).toBe(false);
        });
    });

    const validImageNames = [
        'a.jpg',
        'a.png',
        'a.gif',
        'a.JPG',
        'newName.jpg',
        'newName.jpeg',
        'new-name.jpg',
        'new_name.jpg',
    ];
    validImageNames.forEach((imageName) => {
        test(`Should be valid: [${imageName}]`, async () => {
            expect(isValidImageName(imageName)).toBe(true);
        });
    });
});

describe('isValidImageNameStrict', () => {
    const invalidImageNamesStrict = [
        '',
        ' ',
        '/',
        '2000',
        '/2000',
        '2000/',
        '/2000/',
        '2000/12-31',
        '/2000/12-31/',
        '2000/12-31/image.jpg',
        '/2000/12-31/image.jpg',
        '/2000/12-31/image',
        '/image.jpg',
        'image.xxx', // unknown extension
        'image.pdf', // pdf
        'image.heic', // heic
        'image.jpeg', // jpeg
        'image.jpg ', // space at end
        ' image.jpg', // space at beginning
        'image .jpg', // space before dot
        'NAME.jpg',
        'name.JPG',
        'NAME.JPG',
        'image.',
        'image',
        '.jpg',
        ' .jpg',
        'a b.jpg',
        'a-b.jpg',
        'a.b.jpg',
        'a%b.jpg',
        'a^b.jpg',
        'a b.jpg',
        '_.jpg',
        '__.jpg',
        '_image.jpg', // _ at beginning
        'image_.jpg', // _ at end
    ];
    invalidImageNamesStrict.forEach((imageName) => {
        test(`Should be invalid: [${imageName}]`, async () => {
            expect(isValidImageNameStrict(imageName)).toBe(false);
        });
    });

    const validImageNamesStrict = ['image.jpg', 'a.jpg', 'a_b.jpg', 'image1_renamed.jpg', 'image.gif', 'image.png'];
    validImageNamesStrict.forEach((imageName) => {
        test(`Should be valid: [${imageName}]`, async () => {
            expect(isValidImageNameStrict(imageName)).toBe(true);
        });
    });
});

describe('sanitizeImageName', () => {
    const namePairs = [
        { in: '', out: '' },
        { in: 'image', out: 'image' },
        { in: 'image.', out: 'image.' },
        { in: 'image.png', out: 'image.png' },
        { in: 'image.jpg', out: 'image.jpg' },
        { in: 'IMAGE.jpg', out: 'image.jpg' },
        { in: 'image.JPG', out: 'image.jpg' },
        { in: 'image.jpeg', out: 'image.jpg' },
        { in: 'image.JPEG', out: 'image.jpg' },
        { in: '_image.jpg', out: 'image.jpg' },
        { in: 'image_.jpg', out: 'image.jpg' },
        { in: '-image.jpg', out: 'image.jpg' },
        { in: 'image-.jpg', out: 'image.jpg' },
        { in: '-image.jpg', out: 'image.jpg' },
        { in: 'image-.jpg', out: 'image.jpg' },
        { in: 'image .jpg', out: 'image.jpg' },
        { in: ' image.jpg', out: 'image.jpg' },
        { in: 'image!.jpg', out: 'image.jpg' },
        { in: 'a-1.jpg', out: 'a_1.jpg' },
        { in: 'a 1.jpg', out: 'a_1.jpg' },
        { in: 'a*1.jpg', out: 'a_1.jpg' },
        { in: 'a&1.jpg', out: 'a_1.jpg' },
        { in: 'a*1.jpg', out: 'a_1.jpg' },
        { in: 'a--1.jpg', out: 'a_1.jpg' },
        { in: 'a__1.jpg', out: 'a_1.jpg' },
        { in: 'image.invalidExtension', out: 'image.invalidextension' },
    ];
    namePairs.forEach((namePair) => {
        test(`In: [${namePair.in}] Out: [${namePair.out}]`, () => {
            expect(sanitizeImageName(namePair.in)).toBe(namePair.out);
        });
    });
});
