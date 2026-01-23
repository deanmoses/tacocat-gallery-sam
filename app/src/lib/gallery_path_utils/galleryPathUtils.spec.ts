import {
    getParentAndNameFromPath,
    getParentFromPath,
    getParentFromPathForUpload,
    getNameFromPath,
    isValidPath,
    isValidPathForUpload,
    isValidAlbumPath,
    isValidDayAlbumName,
    isValidImageName,
    isValidImageNameStrict,
    isValidImagePath,
    isValidImagePathForUpload,
    isValidYearAlbumPath,
    isValidDayAlbumPath,
    albumPathToDate,
    pathToDate,
    toPathFromItem,
    toAlbumPath,
    toMediaPath,
    hasHeicExtension,
    hasVideoExtension,
    hasImageExtension,
    isValidVideoPath,
    isValidVideoName,
    isValidVideoNameStrict,
    isValidMediaPath,
    isValidMediaPathForUpload,
    isValidMediaNameStrict,
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

    // HEIC should NOT be valid for isValidImagePath (stored images)
    const heicPaths = ['/2001/12-31/image.heic', '/2001/12-31/image.HEIC', '/2001/12-31/image.heif'];
    heicPaths.forEach((path) => {
        it(`Should be invalid (HEIC not allowed for storage): [${path}]`, () => {
            expect(isValidImagePath(path)).toStrictEqual(false);
        });
    });
});

describe('isValidImagePathForUpload', () => {
    // All the same invalid paths as isValidImagePath
    const invalidImagePaths = [
        '',
        'notapath',
        '/not/a/real/path',
        '/',
        '//',
        '/2001/',
        '/2001/12-31/',
        'image.jpg',
        '/image.jpg',
        '2001/12-31/image.jpg',
        '/2001/12-31/.jpg',
        '/2001/12-31/image',
        '/2001/image.jpg',
        '/2001/12-31/image.dng', // unsupported format
        '/2001/12-31/image.pdf', // unsupported format
        '/2001/12-31/image.txt', // unsupported format
    ];
    invalidImagePaths.forEach((path) => {
        it(`Should be invalid: [${path}]`, () => {
            expect(isValidImagePathForUpload(path)).toStrictEqual(false);
        });
    });

    // All standard formats should be valid
    const validStandardPaths = [
        '/2001/12-31/image.jpg',
        '/2001/12-31/image.jpeg',
        '/2001/12-31/image.png',
        '/2001/12-31/image.gif',
        '/2001/12-31/IMAGE.JPG',
    ];
    validStandardPaths.forEach((path) => {
        it(`Should be valid (standard format): [${path}]`, () => {
            expect(isValidImagePathForUpload(path)).toStrictEqual(true);
        });
    });

    // HEIC/HEIF should be valid for upload
    const validHeicPaths = [
        '/2001/12-31/image.heic',
        '/2001/12-31/image.HEIC',
        '/2001/12-31/image.Heic',
        '/2001/12-31/image.heif',
        '/2001/12-31/image.HEIF',
    ];
    validHeicPaths.forEach((path) => {
        it(`Should be valid (HEIC/HEIF for upload): [${path}]`, () => {
            expect(isValidImagePathForUpload(path)).toStrictEqual(true);
        });
    });
});

describe('hasHeicExtension', () => {
    const heicPaths = [
        '/2001/12-31/image.heic',
        '/2001/12-31/image.HEIC',
        '/2001/12-31/image.Heic',
        '/2001/12-31/image.heif',
        '/2001/12-31/image.HEIF',
        'image.heic',
        'anything.heif',
    ];
    heicPaths.forEach((path) => {
        it(`Should have HEIC extension: [${path}]`, () => {
            expect(hasHeicExtension(path)).toStrictEqual(true);
        });
    });

    const nonHeicPaths = [
        '/2001/12-31/image.jpg',
        '/2001/12-31/image.jpeg',
        '/2001/12-31/image.png',
        '/2001/12-31/image.gif',
        'image.jpg',
        '',
        'heic',
        '.heic', // just extension, no filename
    ];
    nonHeicPaths.forEach((path) => {
        it(`Should NOT have HEIC extension: [${path}]`, () => {
            expect(hasHeicExtension(path)).toStrictEqual(false);
        });
    });
});

describe('hasVideoExtension', () => {
    const videoPaths = [
        '/2001/12-31/video.mp4',
        '/2001/12-31/video.MP4',
        'video.mov',
        'video.avi',
        'video.mkv',
        'video.webm',
        'video.m4v',
        'video.3gp',
    ];
    videoPaths.forEach((path) => {
        it(`Should have video extension: [${path}]`, () => {
            expect(hasVideoExtension(path)).toStrictEqual(true);
        });
    });

    const nonVideoPaths = ['/2001/12-31/image.jpg', 'image.png', '', 'mp4', '.mp4'];
    nonVideoPaths.forEach((path) => {
        it(`Should NOT have video extension: [${path}]`, () => {
            expect(hasVideoExtension(path)).toStrictEqual(false);
        });
    });
});

describe('hasImageExtension', () => {
    const imagePaths = ['/2001/12-31/image.jpg', '/2001/12-31/image.JPG', 'image.jpeg', 'image.png', 'image.gif'];
    imagePaths.forEach((path) => {
        it(`Should have image extension: [${path}]`, () => {
            expect(hasImageExtension(path)).toStrictEqual(true);
        });
    });

    const nonImagePaths = [
        '/2001/12-31/video.mp4',
        '/2001/12-31/image.heic', // HEIC is not a stored image format
        'video.mov',
        '',
        'jpg',
        '.jpg',
    ];
    nonImagePaths.forEach((path) => {
        it(`Should NOT have image extension: [${path}]`, () => {
            expect(hasImageExtension(path)).toStrictEqual(false);
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
        'monkey_river_15_howler_monkey_calling.jpg', // long filename regression test
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

describe('isValidVideoNameStrict', () => {
    const invalidVideoNamesStrict = [
        '',
        ' ',
        '/',
        '2000',
        '/2000',
        '2000/',
        '/2000/',
        '2000/12-31',
        '/2000/12-31/',
        '2000/12-31/video.mp4',
        '/2000/12-31/video.mp4',
        '/2000/12-31/video',
        '/video.mp4',
        'video.xxx', // unknown extension
        'video.pdf', // pdf
        'video.jpg', // image extension
        'video.mp4 ', // space at end
        ' video.mp4', // space at beginning
        'video .mp4', // space before dot
        'NAME.mp4',
        'name.MP4',
        'NAME.MP4',
        'video.',
        'video',
        '.mp4',
        ' .mp4',
        'a b.mp4',
        'a-b.mp4', // hyphen not allowed in strict
        'a.b.mp4',
        'a%b.mp4',
        'a^b.mp4',
        '_.mp4',
        '__.mp4',
        '_video.mp4', // _ at beginning
        'video_.mp4', // _ at end
    ];
    invalidVideoNamesStrict.forEach((videoName) => {
        test(`Should be invalid: [${videoName}]`, async () => {
            expect(isValidVideoNameStrict(videoName)).toBe(false);
        });
    });

    const validVideoNamesStrict = [
        'video.mp4',
        'a.mp4',
        'a_b.mp4',
        'video1_renamed.mp4',
        'video.mov',
        'video.avi',
        'video.mkv',
        'video.webm',
        'video.m4v',
        'video.3gp',
    ];
    validVideoNamesStrict.forEach((videoName) => {
        test(`Should be valid: [${videoName}]`, async () => {
            expect(isValidVideoNameStrict(videoName)).toBe(true);
        });
    });
});

describe('isValidMediaNameStrict', () => {
    // Invalid: neither valid image nor valid video strict name
    const invalidMediaNamesStrict = [
        '',
        ' ',
        'media.pdf',
        'media.heic',
        'NAME.jpg', // uppercase
        'NAME.mp4', // uppercase
        'a-b.jpg', // hyphen
        'a-b.mp4', // hyphen
        '_image.jpg', // _ at beginning
        '_video.mp4', // _ at beginning
    ];
    invalidMediaNamesStrict.forEach((mediaName) => {
        test(`Should be invalid: [${mediaName}]`, async () => {
            expect(isValidMediaNameStrict(mediaName)).toBe(false);
        });
    });

    // Valid: either valid strict image or valid strict video
    const validMediaNamesStrict = [
        // Images
        'image.jpg',
        'photo.gif',
        'picture.png',
        // Videos
        'video.mp4',
        'clip.mov',
        'movie.avi',
    ];
    validMediaNamesStrict.forEach((mediaName) => {
        test(`Should be valid: [${mediaName}]`, async () => {
            expect(isValidMediaNameStrict(mediaName)).toBe(true);
        });
    });

    // Regression test for ReDoS vulnerability: long filenames with underscores
    // must complete quickly, not hang due to catastrophic backtracking
    test('Should handle long filenames with multiple underscores without hanging', () => {
        const longValidName = 'monkey_river_15_howler_monkey_calling.mov';
        const longInvalidName = 'monkey_river_15_howler_monkey_calling_.mov'; // trailing underscore

        const startValid = performance.now();
        expect(isValidMediaNameStrict(longValidName)).toBe(true);
        const validTime = performance.now() - startValid;

        const startInvalid = performance.now();
        expect(isValidMediaNameStrict(longInvalidName)).toBe(false);
        const invalidTime = performance.now() - startInvalid;

        // Both should complete in under 100ms (was hanging for 100+ seconds before fix)
        expect(validTime).toBeLessThan(100);
        expect(invalidTime).toBeLessThan(100);
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

describe('toPathFromItem', () => {
    test('root album', () => {
        expect(
            toPathFromItem({
                parentPath: '',
                itemName: '/',
                itemType: 'album',
            }),
        ).toBe('/');
    });

    test('year album', () => {
        expect(
            toPathFromItem({
                parentPath: '/',
                itemName: '2001',
                itemType: 'album',
            }),
        ).toBe('/2001/');
    });
    test('day album', () => {
        expect(
            toPathFromItem({
                parentPath: '/2001/',
                itemName: '12-31',
                itemType: 'album',
            }),
        ).toBe('/2001/12-31/');
    });
    test('image', () => {
        expect(
            toPathFromItem({
                parentPath: '/2001/12-31/',
                itemName: 'image.jpg',
                itemType: 'image',
            }),
        ).toBe('/2001/12-31/image.jpg');
    });
});

describe('isValidVideoPath', () => {
    const invalidVideoPaths = [
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
        'video.mp4',
        '/video.mp4',
        '12-31/video.mp4',
        '2001/12-31/video.mp4',
        '/2001/12-31/.mp4',
        '/2001/12-31/video.',
        '/2001/12-31/video',
        '/2001/12-31/video/mp4',
        '/2001/12-31/video/',
        '/2001/13-31/video.mp4',
        '/2001/12-32/video.mp4',
        '/2001/1231/video.mp4',
        '//2001/12-31/video.mp4',
        '/2001/video.mp4',
        '/video.mp4',
        '/2001/12-31/..mp4',
        '/2001/12-31/@.mp4',
        '/2001/12-31/$.mp4',
        '/2001/12-31/#.mp4',
        '/2001/12-31/*.mp4',
        '/2001/12-31/&.mp4',
        '/2001/12-31/ .mp4',
        '/2001/12-31/a a.mp4',
        '/2001/12-31/a .mp4',
        '/2001/12-31/?.mp4',
        '/2001/12-31/%.mp4',
        '/2001/12-31/video.mp4 ',
        ' /2001/12-31/video.mp4',
        '/2001/12-31/ video.mp4',
        '/2001/12-31/video .mp4',
        '/2001/12-31/video. mp4',
        '/2001/12-31/vid eo.mp4',
        '/2001/12-31/video.mp41',
        // Image formats should NOT be valid video paths
        '/2001/12-31/image.jpg',
        '/2001/12-31/image.jpeg',
        '/2001/12-31/image.png',
        '/2001/12-31/image.gif',
        '/2001/12-31/image.heic',
    ];
    invalidVideoPaths.forEach((path) => {
        it(`Should be invalid: [${path}]`, () => {
            expect(isValidVideoPath(path)).toStrictEqual(false);
        });
    });

    const validVideoPaths = [
        '/2001/12-31/video.mp4',
        '/2001/12-31/v.mp4',
        '/2001/12-31/v-1.mp4',
        '/2001/12-31/v_1.mp4',
        '/2001/12-31/1.mp4',
        '/3000/01-01/VIDEO.MP4',
        '/2001/12-31/video.mov',
        '/2001/12-31/video.MOV',
        '/2001/12-31/video.avi',
        '/2001/12-31/video.AVI',
        '/2001/12-31/video.mkv',
        '/2001/12-31/video.MKV',
        '/2001/12-31/video.webm',
        '/2001/12-31/video.WEBM',
        '/2001/12-31/video.m4v',
        '/2001/12-31/video.M4V',
        '/2001/12-31/video.3gp',
        '/2001/12-31/video.3GP',
    ];
    validVideoPaths.forEach((path) => {
        it(`Should be valid: [${path}]`, () => {
            expect(isValidVideoPath(path)).toStrictEqual(true);
        });
    });
});

describe('isValidVideoName', () => {
    const invalidVideoNames = [
        '',
        '/',
        'adf',
        '2000',
        '/2000',
        '2000/',
        '/2000/',
        '2000/12-31',
        '/2000/12-31/',
        '2000/12-31/video.mp4',
        '/2000/12-31/video.mp4',
        '/2000/12-31/video',
        'newName.pdf',
        'newName.jpg', // image, not video
        'newName.png', // image, not video
        'newName.mp4 ', // space at end
        ' newName.mp4', // space at beginning
        '/newName.mp4',
        'newName.',
        'newName',
        '.mp4',
        'a^b.mp4',
        'a b.mp4',
    ];
    invalidVideoNames.forEach((videoName) => {
        test(`Should be invalid: [${videoName}]`, async () => {
            expect(isValidVideoName(videoName)).toBe(false);
        });
    });

    const validVideoNames = [
        'a.mp4',
        'a.mov',
        'a.avi',
        'a.mkv',
        'a.webm',
        'a.m4v',
        'a.3gp',
        'a.MP4',
        'newName.mp4',
        'new-name.mp4',
        'new_name.mp4',
        'VIDEO.MOV',
        'monkey_river_15_howler_monkey_calling.mov', // long filename regression test
    ];
    validVideoNames.forEach((videoName) => {
        test(`Should be valid: [${videoName}]`, async () => {
            expect(isValidVideoName(videoName)).toBe(true);
        });
    });
});

describe('isValidMediaPath', () => {
    // Invalid paths (neither image nor video)
    const invalidMediaPaths = [
        '',
        'notapath',
        '/not/a/real/path',
        '/',
        '//',
        '/2001/',
        '/2001/12-31/',
        'media.jpg',
        '/media.jpg',
        '2001/12-31/media.jpg',
        '/2001/12-31/.jpg',
        '/2001/12-31/media',
        '/2001/media.jpg',
        '/2001/12-31/media.pdf', // unsupported format
        '/2001/12-31/media.txt', // unsupported format
        '/2001/12-31/media.doc', // unsupported format
    ];
    invalidMediaPaths.forEach((path) => {
        it(`Should be invalid: [${path}]`, () => {
            expect(isValidMediaPath(path)).toStrictEqual(false);
        });
    });

    // Valid image paths should be valid media paths
    const validImagePaths = [
        '/2001/12-31/image.jpg',
        '/2001/12-31/image.jpeg',
        '/2001/12-31/image.png',
        '/2001/12-31/image.gif',
        '/2001/12-31/IMAGE.JPG',
    ];
    validImagePaths.forEach((path) => {
        it(`Should be valid (image): [${path}]`, () => {
            expect(isValidMediaPath(path)).toStrictEqual(true);
        });
    });

    // Valid video paths should be valid media paths
    const validVideoPaths = [
        '/2001/12-31/video.mp4',
        '/2001/12-31/video.mov',
        '/2001/12-31/video.avi',
        '/2001/12-31/video.mkv',
        '/2001/12-31/video.webm',
        '/2001/12-31/video.m4v',
        '/2001/12-31/video.3gp',
        '/2001/12-31/VIDEO.MP4',
    ];
    validVideoPaths.forEach((path) => {
        it(`Should be valid (video): [${path}]`, () => {
            expect(isValidMediaPath(path)).toStrictEqual(true);
        });
    });

    // HEIC should NOT be valid for isValidMediaPath (stored media)
    const heicPaths = ['/2001/12-31/image.heic', '/2001/12-31/image.HEIC', '/2001/12-31/image.heif'];
    heicPaths.forEach((path) => {
        it(`Should be invalid (HEIC not allowed for storage): [${path}]`, () => {
            expect(isValidMediaPath(path)).toStrictEqual(false);
        });
    });
});

describe('isValidMediaPathForUpload', () => {
    // Invalid paths
    const invalidMediaPaths = [
        '',
        'notapath',
        '/not/a/real/path',
        '/',
        '/2001/',
        '/2001/12-31/',
        'media.jpg',
        '/media.jpg',
        '/2001/12-31/media.pdf',
        '/2001/12-31/media.txt',
    ];
    invalidMediaPaths.forEach((path) => {
        it(`Should be invalid: [${path}]`, () => {
            expect(isValidMediaPathForUpload(path)).toStrictEqual(false);
        });
    });

    // Valid image paths (including HEIC for upload)
    const validImagePaths = [
        '/2001/12-31/image.jpg',
        '/2001/12-31/image.jpeg',
        '/2001/12-31/image.png',
        '/2001/12-31/image.gif',
        '/2001/12-31/image.heic',
        '/2001/12-31/image.HEIC',
        '/2001/12-31/image.heif',
    ];
    validImagePaths.forEach((path) => {
        it(`Should be valid (image for upload): [${path}]`, () => {
            expect(isValidMediaPathForUpload(path)).toStrictEqual(true);
        });
    });

    // Valid video paths
    const validVideoPaths = [
        '/2001/12-31/video.mp4',
        '/2001/12-31/video.mov',
        '/2001/12-31/video.avi',
        '/2001/12-31/video.mkv',
        '/2001/12-31/video.webm',
        '/2001/12-31/video.m4v',
        '/2001/12-31/video.3gp',
    ];
    validVideoPaths.forEach((path) => {
        it(`Should be valid (video for upload): [${path}]`, () => {
            expect(isValidMediaPathForUpload(path)).toStrictEqual(true);
        });
    });
});

describe('isValidPath', () => {
    const invalidPaths = [
        '',
        'notapath',
        '/not/a/real/path',
        '//',
        '/2001/12-31/image', // no extension
        '/2001/image.jpg', // on year album
        '/image.jpg', // on root
    ];
    invalidPaths.forEach((path) => {
        it(`Should be invalid: [${path}]`, () => {
            expect(isValidPath(path)).toStrictEqual(false);
        });
    });

    // Valid album paths
    const validAlbumPaths = ['/', '/2001/', '/2001/12-31/'];
    validAlbumPaths.forEach((path) => {
        it(`Should be valid (album): [${path}]`, () => {
            expect(isValidPath(path)).toStrictEqual(true);
        });
    });

    // Valid media paths
    const validMediaPaths = ['/2001/12-31/image.jpg', '/2001/12-31/video.mp4'];
    validMediaPaths.forEach((path) => {
        it(`Should be valid (media): [${path}]`, () => {
            expect(isValidPath(path)).toStrictEqual(true);
        });
    });

    // HEIC should NOT be valid (not a stored format)
    it('Should be invalid (HEIC not stored format)', () => {
        expect(isValidPath('/2001/12-31/image.heic')).toStrictEqual(false);
    });
});

describe('isValidPathForUpload', () => {
    const invalidPaths = [
        '',
        'notapath',
        '/not/a/real/path',
        '/2001/12-31/image', // no extension
        '/2001/image.jpg', // on year album
        '/image.jpg', // on root
        '/2001/12-31/file.pdf', // unsupported format
    ];
    invalidPaths.forEach((path) => {
        it(`Should be invalid: [${path}]`, () => {
            expect(isValidPathForUpload(path)).toStrictEqual(false);
        });
    });

    // Valid album paths
    const validAlbumPaths = ['/', '/2001/', '/2001/12-31/'];
    validAlbumPaths.forEach((path) => {
        it(`Should be valid (album): [${path}]`, () => {
            expect(isValidPathForUpload(path)).toStrictEqual(true);
        });
    });

    // Valid media paths including HEIC
    const validMediaPaths = [
        '/2001/12-31/image.jpg',
        '/2001/12-31/image.heic',
        '/2001/12-31/image.HEIF',
        '/2001/12-31/video.mp4',
    ];
    validMediaPaths.forEach((path) => {
        it(`Should be valid (media for upload): [${path}]`, () => {
            expect(isValidPathForUpload(path)).toStrictEqual(true);
        });
    });
});

describe('getParentFromPath', () => {
    const testCases = [
        { in: '/', out: '' },
        { in: '/2001/', out: '/' },
        { in: '/2001/12-31/', out: '/2001/' },
        { in: '/2001/12-31/image.jpg', out: '/2001/12-31/' },
        { in: '/2001/12-31/video.mp4', out: '/2001/12-31/' },
    ];
    testCases.forEach((tc) => {
        it(`[${tc.in}] -> [${tc.out}]`, () => {
            expect(getParentFromPath(tc.in)).toStrictEqual(tc.out);
        });
    });

    it('Should throw for invalid path', () => {
        expect(() => getParentFromPath('invalid')).toThrow(/invalid/i);
    });
});

describe('getParentFromPathForUpload', () => {
    const testCases = [
        { in: '/', out: '' },
        { in: '/2001/', out: '/' },
        { in: '/2001/12-31/', out: '/2001/' },
        { in: '/2001/12-31/image.jpg', out: '/2001/12-31/' },
        { in: '/2001/12-31/image.heic', out: '/2001/12-31/' },
        { in: '/2001/12-31/video.mp4', out: '/2001/12-31/' },
    ];
    testCases.forEach((tc) => {
        it(`[${tc.in}] -> [${tc.out}]`, () => {
            expect(getParentFromPathForUpload(tc.in)).toStrictEqual(tc.out);
        });
    });

    it('Should throw for invalid path', () => {
        expect(() => getParentFromPathForUpload('invalid')).toThrow(/invalid/i);
    });
});

describe('getNameFromPath', () => {
    const testCases = [
        { in: '/', out: '' },
        { in: '/2001/', out: '2001' },
        { in: '/2001/12-31/', out: '12-31' },
        { in: '/2001/12-31/image.jpg', out: 'image.jpg' },
        { in: '/2001/12-31/video.mp4', out: 'video.mp4' },
    ];
    testCases.forEach((tc) => {
        it(`[${tc.in}] -> [${tc.out}]`, () => {
            expect(getNameFromPath(tc.in)).toStrictEqual(tc.out);
        });
    });

    it('Should throw for invalid path', () => {
        expect(() => getNameFromPath('invalid')).toThrow(/invalid/i);
    });
});

describe('pathToDate', () => {
    const invalidInputs = ['', '2001/', '/2001', '/2001/12-31/image'];
    invalidInputs.forEach((invalidInput) => {
        it(`Invalid: [${invalidInput}]`, () => {
            expect(() => pathToDate(invalidInput)).toThrow(/invalid/i);
        });
    });

    // Album paths
    const albumInputs = [
        { in: '/', out: new Date(1826, 0, 1) },
        { in: '/2001/', out: new Date(2001, 0, 1) },
        { in: '/2001/12-31/', out: new Date(2001, 11, 31) },
    ];
    albumInputs.forEach((input) => {
        it(`Album [${input.in}] -> [${input.out.toDateString()}]`, () => {
            expect(pathToDate(input.in)).toEqual(input.out);
        });
    });

    // Media paths (should return parent album's date)
    const mediaInputs = [
        { in: '/2001/12-31/image.jpg', out: new Date(2001, 11, 31) },
        { in: '/2001/01-15/video.mp4', out: new Date(2001, 0, 15) },
    ];
    mediaInputs.forEach((input) => {
        it(`Media [${input.in}] -> [${input.out.toDateString()}]`, () => {
            expect(pathToDate(input.in)).toEqual(input.out);
        });
    });
});

describe('toAlbumPath', () => {
    it('Root album', () => {
        expect(toAlbumPath('', '/')).toBe('/');
    });

    it('Year album', () => {
        expect(toAlbumPath('/', '2001')).toBe('/2001/');
    });

    it('Day album', () => {
        expect(toAlbumPath('/2001/', '12-31')).toBe('/2001/12-31/');
    });

    it('Should throw for undefined parentPath', () => {
        expect(() => toAlbumPath(undefined, '2001')).toThrow(/undefined/i);
    });

    it('Should throw for undefined itemName', () => {
        expect(() => toAlbumPath('/', undefined)).toThrow(/undefined/i);
    });
});

describe('toMediaPath', () => {
    it('Image path', () => {
        expect(toMediaPath('/2001/12-31/', 'image.jpg')).toBe('/2001/12-31/image.jpg');
    });

    it('Video path', () => {
        expect(toMediaPath('/2001/12-31/', 'video.mp4')).toBe('/2001/12-31/video.mp4');
    });

    it('Should throw for undefined parentPath', () => {
        expect(() => toMediaPath(undefined, 'image.jpg')).toThrow(/undefined/i);
    });

    it('Should throw for undefined itemName', () => {
        expect(() => toMediaPath('/2001/12-31/', undefined)).toThrow(/undefined/i);
    });
});
