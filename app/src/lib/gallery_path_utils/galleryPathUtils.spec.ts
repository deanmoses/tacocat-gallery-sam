import {
    getParentAndNameFromPath,
    isValidAlbumPath as isValidPath,
    isValidDayAlbumName,
    isValidImageName,
    isValidImageNameStrict,
    isValidImagePath,
    isValidYearAlbumPath,
    sanitizeImageName,
    isValidDayAlbumPath,
    albumPathToDate,
} from './galleryPathUtils';

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
            expect(isValidPath(path)).toStrictEqual(false);
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
            expect(isValidPath(path)).toStrictEqual(true);
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
        '/2030/01-01/', // day
        '/2001/01-09/', // day
        '/2001/01-11/', // day
        '/2018/01-24/', // day
        '/2001/12-31/', // day
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

describe('isValidDayAlbumPath', () => {
    const invalidDayAlbumPaths = [
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
    invalidDayAlbumPaths.forEach((path) => {
        it(`Should be invalid: [${path}]`, () => {
            expect(isValidDayAlbumPath(path)).toStrictEqual(false);
        });
    });

    const validDayAlbumPaths = ['/2001/12-31/', '/2018/01-01/', '/2018/09-09/', '/2029/10-10/', '/2100/11-22/'];
    validDayAlbumPaths.forEach((path) => {
        it(`Should be valid: [${path}]`, () => {
            expect(isValidDayAlbumPath(path)).toStrictEqual(true);
        });
    });
});

describe('isValidDayAlbumName', () => {
    const invalidDayAlbumNames = [
        '',
        '/', // root
        'notapath',
        '/not/a/real/path',
        '//',
        '/1/',
        '/10/',
        '/200/',
        '/2001',
        '2001', // year
        '/12-31', // slashes
        '/12-31/', // slashes
        '12_31', // underscore
        '12 32', // space
        ' 12-32', // leading space
        '12-32 ', // trailing space
        'i2-o2', // letters
        '13-01', // nonexistent month
        '01-32', // nonexistent day
        '01-100', // nonexistent day
        '/2030/01-01/', // day path
        '/2001/01-09/', // day path
        '/2001/01-11/', // day path
        '/2018/01-24/', // day path
        '/2001/12-31/', // day path
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
    invalidDayAlbumNames.forEach((dayAlbumName) => {
        it(`Should be invalid: [${dayAlbumName}]`, () => {
            expect(isValidDayAlbumName(dayAlbumName)).toStrictEqual(false);
        });
    });

    const validDayAlbumNames = ['01-01', '01-09', '01-11', '01-24', '09-01', '10-10', '11-29', '12-31'];
    validDayAlbumNames.forEach((dayAlbumName) => {
        it(`Should be valid: [${dayAlbumName}]`, () => {
            expect(isValidDayAlbumName(dayAlbumName)).toStrictEqual(true);
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

describe('getParentAndNameFromPath', () => {
    const invalidInputs = [
        '',
        '2001',
        '/2001',
        '2001/',
        '2001/12-31',
        '/2001/12-31', // no trailing slash
        '/2001/12-31/image', // no image extension
        '2001/12-31/image.jpg', // no starting slash
        'image.jpg',
        '/image.jpg',
    ];
    invalidInputs.forEach((invalidInput) => {
        test(`Invalid: [${invalidInput}]`, () => {
            expect(() => {
                getParentAndNameFromPath(invalidInput);
            }).toThrow(/invalid/i);
        });
    });

    const validInputs = [
        { in: '/', out: { parent: '', name: '' } }, // TODO: shouldn't parent be undefined and name be ''?
        { in: '/2001/', out: { parent: '/', name: '2001' } },
        { in: '/2001/12-31/', out: { parent: '/2001/', name: '12-31' } },
        { in: '/2001/12-31/image.jpg', out: { parent: '/2001/12-31/', name: 'image.jpg' } },
    ];
    validInputs.forEach((validInput) => {
        test(`In: [${validInput.in}] Out: [${validInput.out.parent}][${validInput.out.name}]`, () => {
            expect(getParentAndNameFromPath(validInput.in)).toStrictEqual(validInput.out);
        });
    });
});

describe('albumPathToDate', () => {
    const invalidInputs = [
        '',
        '2001/', // no starting slash
        '/2001', // no trailing slash
        '2001/12-31/', // no starting slash
        '/2001/12-31', // no trailing slash
        '/2001/12-31/image.jpg', // image
    ];
    invalidInputs.forEach((invalidInput) => {
        test(`Invalid: [${invalidInput}]`, () => {
            expect(() => {
                albumPathToDate(invalidInput);
            }).toThrow(/invalid/i);
        });
    });

    const inputs = [
        { in: '/', out: new Date(1826, 0, 1) },
        { in: '/2001/', out: new Date(2001, 0, 1) },
        { in: '/1970/', out: new Date(1970, 0, 1) },
        { in: '/2001/01-01/', out: new Date(2001, 0, 1) },
        { in: '/2001/01-02/', out: new Date(2001, 0, 2) },
        { in: '/2023/12-31/', out: new Date(2023, 11, 31) },
    ];
    inputs.forEach((input) => {
        test(`In: [${input.in}] Out: [${input.out.toDateString()}]`, () => {
            expect(albumPathToDate(input.in)).toEqual(input.out);
        });
    });
});
