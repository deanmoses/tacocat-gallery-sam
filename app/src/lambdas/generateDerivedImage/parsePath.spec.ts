import { parsePath } from './parsePath';

// Parse parameters from path
// example: /i/2001/12-31/image.jpg/VERSIONID/webp/300x400/fp=200,100/crop=10,20,400,540

it.each([
    '/i/2001/12-31/image.jpg/VERSIONID',
    '/i/2001/12-31/image.jpg/VERSIONID/',
    '/i/2001/12-31/image.jpg/VERSIONID/400x300',
    '/i/2001/12-31/image.jpg/VERSIONID/400x300/crop=1,2,3,4',
])('should extract id and version from %p', (path) => {
    const r = parsePath(path);
    expect(r.id).toEqual('2001/12-31/image.jpg');
    expect(r.versionId).toEqual('VERSIONID');
    expect(r).not.toHaveProperty('error');
});

it('should return falsy image & version ids if path does not start with IMAGE_PATH', () => {
    const r = parsePath('/wrongpath/UUID');
    expect(r.id).toBeFalsy();
    expect(r.versionId).toBeFalsy();
    expect(r).toHaveProperty('error');
});

it('should return falsy image id if path does not contain an image id', () => {
    const r = parsePath('/2001/12-31/image');
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
    const r = parsePath(path);
    expect(r.versionId).toBeFalsy();
    expect(r).toHaveProperty('error');
});

it.each(['/i/2001/12-31/image.jpg/VERSIONID/webp/bla=123/fp=10,20'])(
    'should return error if %p contains unparsable segments',
    (path) => {
        expect(parsePath(path)).toHaveProperty('error');
    },
);

it.each([
    ['avif', '/i/2001/12-31/image.jpg/VERSIONID/avif'],
    ['webp', '/i/2001/12-31/image.jpg/VERSIONID/webp/'],
    ['jpeg', '/i/2001/12-31/image.jpg/VERSIONID/jpeg/400x300'],
])('should extract image type %p from from path %p', (expectedType, path) => {
    const { format, error } = parsePath(path);
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
    const { width, height, error } = parsePath(path);
    expect({ width, height }).toEqual(expectedDimension);
    expect(error).toBeUndefined();
});

it('should extract focus point', () => {
    const { focus, error } = parsePath('/i/2001/12-31/image.jpg/VERSIONID/fp=200,100');
    expect(focus).toEqual({ x: 200, y: 100 });
    expect(error).toBeUndefined();
});

it('should extract crop rectangle', () => {
    const { crop, error } = parsePath('/i/2001/12-31/image.jpg/VERSIONID/fp=200,100/crop=10,20,30,40');
    expect(crop).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(error).toBeUndefined();
});

it('should ignore empty segments', () => {
    const params = parsePath('/i/2001/12-31/image.jpg/VERSIONID/fp=200,100///100x200/');
    expect(params).toEqual({
        id: '2001/12-31/image.jpg',
        versionId: 'VERSIONID',
        focus: { x: 200, y: 100 },
        width: 100,
        height: 200,
    });
});

it('should ignore empty segments #2', () => {
    const { crop, error } = parsePath('/i/2001/12-31/image.jpg/VERSIONID///crop=10,20,30,40');
    expect(crop).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    expect(error).toBeUndefined();
});

it('should extract quality parameter', () => {
    const { quality, error } = parsePath('/i/2001/12-31/image.jpg/VERSIONID/q=50');
    expect(quality).toEqual(50);
    expect(error).toBeUndefined();
});

it('should extract background parameter', () => {
    const { background, error } = parsePath('/i/2001/12-31/image.jpg/VERSIONID/bg=ff0000/q=50');
    expect(background).toEqual('#ff0000');
    expect(error).toBeUndefined();
});
