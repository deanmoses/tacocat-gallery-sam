import { parseUrlPath } from './parsePath';

// Parse parameters from path
// example: /i/2001/12-31/image.jpg/VERSIONID/webp/300x400/fp=200,100/crop=10,20,400,540

describe('image path regex validation', () => {
    describe('valid image paths', () => {
        it.each([
            '/i/2001/01-01/image.jpg/VER', // min date
            '/i/2001/12-31/image.jpg/VER', // max date
            '/i/2001/12-31/image.gif/VER', // gif extension
            '/i/2001/12-31/image.png/VER', // png extension
            '/i/2001/12-31/image.jpeg/VER', // jpeg extension
            '/i/2001/12-31/image.JPG/VER', // uppercase extension
            '/i/2001/12-31/image.JPEG/VER', // uppercase jpeg
            '/i/2001/12-31/my_photo.jpg/VER', // underscore in name
            '/i/2001/12-31/my-photo.jpg/VER', // hyphen in name
            '/i/2001/12-31/photo123.jpg/VER', // numbers in name
            '/i/2001/12-31/a.jpg/VER', // single char name
        ])('should accept valid image path %s', (path) => {
            const result = parseUrlPath(path);
            expect(result.id).toBeTruthy();
            expect(result.versionId).toBe('VER');
            expect(result.error).toBeUndefined();
        });
    });

    describe('invalid image paths', () => {
        it.each([
            ['/i/2001/00-15/image.jpg/VER', 'invalid month 00'],
            ['/i/2001/13-15/image.jpg/VER', 'invalid month 13'],
            ['/i/2001/12-00/image.jpg/VER', 'invalid day 00'],
            ['/i/2001/12-32/image.jpg/VER', 'invalid day 32'],
            ['/i/2001/12-31/image.bmp/VER', 'unsupported extension'],
            ['/i/2001/12-31/image.webp/VER', 'webp not valid for originals'],
            ['/i/2001/12-31/.jpg/VER', 'empty filename'],
            ['/i/2001/12-31/image./VER', 'no extension'],
            ['/i/01/12-31/image.jpg/VER', 'two digit year'],
            ['/i/2001/1-31/image.jpg/VER', 'single digit month'],
            ['/i/2001/12-1/image.jpg/VER', 'single digit day'],
        ])('should reject %s (%s)', (path) => {
            const result = parseUrlPath(path);
            expect(result.error).toBeDefined();
        });
    });
});

describe('video path regex validation', () => {
    describe('valid video paths', () => {
        it.each([
            '/i/2001/01-01/video.mp4/VER', // min date
            '/i/2001/12-31/video.mp4/VER', // max date
            '/i/2001/12-31/video.mov/VER', // mov extension
            '/i/2001/12-31/video.avi/VER', // avi extension
            '/i/2001/12-31/video.mkv/VER', // mkv extension
            '/i/2001/12-31/video.webm/VER', // webm extension
            '/i/2001/12-31/video.m4v/VER', // m4v extension
            '/i/2001/12-31/video.3gp/VER', // 3gp extension
            '/i/2001/12-31/video.MP4/VER', // uppercase extension
            '/i/2001/12-31/my_video.mp4/VER', // underscore in name
            '/i/2001/12-31/my-video.mp4/VER', // hyphen in name
        ])('should accept valid video path %s', (path) => {
            const result = parseUrlPath(path);
            expect(result.id).toBeTruthy();
            expect(result.versionId).toBe('VER');
            expect(result.error).toBeUndefined();
        });
    });

    describe('invalid video paths', () => {
        it.each([
            ['/i/2001/00-15/video.mp4/VER', 'invalid month 00'],
            ['/i/2001/13-15/video.mp4/VER', 'invalid month 13'],
            ['/i/2001/12-00/video.mp4/VER', 'invalid day 00'],
            ['/i/2001/12-32/video.mp4/VER', 'invalid day 32'],
            ['/i/2001/12-31/video.wmv/VER', 'unsupported extension wmv'],
            ['/i/2001/12-31/video.flv/VER', 'unsupported extension flv'],
        ])('should reject %s (%s)', (path) => {
            const result = parseUrlPath(path);
            expect(result.error).toBeDefined();
        });
    });
});

it.each([
    '/i/2001/12-31/image.jpg/VERSIONID',
    '/i/2001/12-31/image.jpg/VERSIONID/',
    '/i/2001/12-31/image.jpg/VERSIONID/400x300',
    '/i/2001/12-31/image.jpg/VERSIONID/400x300/crop=1,2,3,4',
])('should extract id and version from %p', (path) => {
    const r = parseUrlPath(path);
    expect(r.id).toEqual('2001/12-31/image.jpg');
    expect(r.versionId).toEqual('VERSIONID');
    expect(r).not.toHaveProperty('error');
});

it('should return falsy image & version ids if path does not start with IMAGE_PATH', () => {
    const r = parseUrlPath('/wrongpath/UUID');
    expect(r.id).toBeFalsy();
    expect(r.versionId).toBeFalsy();
    expect(r).toHaveProperty('error');
});

it('should return falsy image id if path does not contain an image id', () => {
    const r = parseUrlPath('/2001/12-31/image');
    expect(r.id).toBeFalsy();
    expect(r.versionId).toBeFalsy();
    expect(r).toHaveProperty('error');
});

it.each([
    '/i/2001/12-31/image.jpg',
    '/i/2001/12-31/image.jpg/',
    '/i/2001/12-31/image.jpg//',
    '/i/2001/12-31/image.jpg//NOT_VERSIONID',
])('should return falsy version id if %p does not contain a version id', (path) => {
    const r = parseUrlPath(path);
    expect(r.versionId).toBeFalsy();
    expect(r).toHaveProperty('error');
});

it.each(['/i/2001/12-31/image.jpg/VERSIONID/webp/bla=123/fp=10,20'])(
    'should return error if %p contains unparsable segments',
    (path) => {
        expect(parseUrlPath(path)).toHaveProperty('error');
    },
);

it.each([
    ['avif', '/i/2001/12-31/image.jpg/VERSIONID/avif'],
    ['webp', '/i/2001/12-31/image.jpg/VERSIONID/webp/'],
    ['jpeg', '/i/2001/12-31/image.jpg/VERSIONID/jpeg/400x300'],
])('should extract image type %p from from path %p', (expectedType, path) => {
    const { format, error } = parseUrlPath(path);
    expect(format).toEqual(expectedType);
    expect(error).toBeUndefined();
});

it.each([
    [{ width: 100, height: NaN }, '/i/2001/12-31/image.jpg/VERSIONID/jpeg/100'],
    [{ width: 200, height: NaN }, '/i/2001/12-31/image.jpg/VERSIONID/jpeg/200x'],
    [{ width: NaN, height: 300 }, '/i/2001/12-31/image.jpg/VERSIONID/jpeg/x300'],
    [{ width: 400, height: 300 }, '/i/2001/12-31/image.jpg/VERSIONID/jpeg/400x300'],
    [{}, '/i/2001/12-31/image.jpg/VERSIONID/jpeg'],
])('should extract dimensions %p from from path %p', (expectedDimension, path) => {
    const { width, height, error } = parseUrlPath(path);
    expect({ width, height }).toEqual(expectedDimension);
    expect(error).toBeUndefined();
});

it('should extract focus point', () => {
    const { focus, error } = parseUrlPath('/i/2001/12-31/image.jpg/VERSIONID/fp=200,100');
    expect(focus).toEqual({ x: 200, y: 100 });
    expect(error).toBeUndefined();
});

it('should extract crop rectangle', () => {
    const { crop, error } = parseUrlPath('/i/2001/12-31/image.jpg/VERSIONID/fp=200,100/crop=10,20,30,40');
    expect(crop).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(error).toBeUndefined();
});

it('should ignore empty segments', () => {
    const params = parseUrlPath('/i/2001/12-31/image.jpg/VERSIONID/fp=200,100///100x200/');
    expect(params).toEqual({
        id: '2001/12-31/image.jpg',
        versionId: 'VERSIONID',
        focus: { x: 200, y: 100 },
        width: 100,
        height: 200,
    });
});

it('should ignore empty segments #2', () => {
    const { crop, error } = parseUrlPath('/i/2001/12-31/image.jpg/VERSIONID///crop=10,20,30,40');
    expect(crop).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(error).toBeUndefined();
});

it('should extract quality parameter', () => {
    const { quality, error } = parseUrlPath('/i/2001/12-31/image.jpg/VERSIONID/q=50');
    expect(quality).toEqual(50);
    expect(error).toBeUndefined();
});

it('should extract background parameter', () => {
    const { background, error } = parseUrlPath('/i/2001/12-31/image.jpg/VERSIONID/bg=ff0000/q=50');
    expect(background).toEqual('#ff0000');
    expect(error).toBeUndefined();
});

// Video path tests - videos use same URL format as images
describe('video paths', () => {
    it.each(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp', 'mpg', 'mpeg'])(
        'should parse video path with .%s extension',
        (ext) => {
            const path = `/i/2001/12-31/video.${ext}/VERSIONID/400x300`;
            const result = parseUrlPath(path);
            expect(result.id).toEqual(`2001/12-31/video.${ext}`);
            expect(result.versionId).toEqual('VERSIONID');
            expect(result.width).toEqual(400);
            expect(result.height).toEqual(300);
            expect(result.error).toBeUndefined();
        },
    );

    it('should parse video path with all parameters', () => {
        const path = '/i/2001/12-31/video.mp4/VERSIONID/webp/400x300/q=80';
        const result = parseUrlPath(path);
        expect(result.id).toEqual('2001/12-31/video.mp4');
        expect(result.versionId).toEqual('VERSIONID');
        expect(result.format).toEqual('webp');
        expect(result.width).toEqual(400);
        expect(result.height).toEqual(300);
        expect(result.quality).toEqual(80);
        expect(result.error).toBeUndefined();
    });
});
