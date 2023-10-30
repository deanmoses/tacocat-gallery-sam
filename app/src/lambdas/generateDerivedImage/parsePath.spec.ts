import { parsePath } from './parsePath';

// parse params from path
// example: /path/to/image/uuid/webp/300x400/fp=200,100/crop=10,20,400,540

// new example: /2001/12-31/image.jpg/webp/300x400/fp=200,100/crop=10,20,400,540

describe('parsePath', () => {
    it.each(['/2001/12-31/image.jpg', '/2001/12-31/image.jpg/', '/2001/12-31/image.jpg/400x300'])(
        'should extract id from path %p',
        (path) => {
            const { id } = parsePath(path);
            expect(id).toEqual('2001/12-31/image.jpg');
        },
    );

    it('should return falsy image id if path does not start with IMAGE_PATH', () => {
        expect(parsePath('/wrongpath/UUID').id).toBeFalsy();
    });

    it('should return falsy image id if path does not contain an image id', () => {
        expect(parsePath('/2001/12-31/image').id).toBeFalsy();
    });

    it('should return an error if path contains unparsable segments', () => {
        expect(parsePath('/2001/12-31/image.jpg/webp/bla=123/fp=10,20')).toHaveProperty('error');
    });

    it.each([
        ['avif', '/2001/12-31/image.jpg/avif'],
        ['webp', '/2001/12-31/image.jpg/webp/'],
        ['jpeg', '/2001/12-31/image.jpg/jpeg/400x300'],
    ])('should extract image type %p from from path %p', (expectedType, path) => {
        const { format, error } = parsePath(path);
        expect(format).toEqual(expectedType);
        expect(error).toBeUndefined();
    });

    it.each([
        [{ width: 100, height: NaN }, '/2001/12-31/image.jpg/jpeg/100'],
        [{ width: 200, height: NaN }, '/2001/12-31/image.jpg/jpeg/200x'],
        [{ width: NaN, height: 300 }, '/2001/12-31/image.jpg/jpeg/x300'],
        [{ width: 400, height: 300 }, '/2001/12-31/image.jpg/jpeg/400x300'],
        [{}, '/2001/12-31/image.jpg/jpeg'],
    ])('should extract dimensions %p from from path %p', (expectedDimension, path) => {
        const { width, height, error } = parsePath(path);
        expect({ width, height }).toEqual(expectedDimension);
        expect(error).toBeUndefined();
    });

    it('should extract focus point', () => {
        const { focus, error } = parsePath('/2001/12-31/image.jpg/fp=200,100');
        expect(focus).toEqual({ x: 200, y: 100 });
        expect(error).toBeUndefined();
    });

    it('should extract crop rectangle', () => {
        const { crop, error } = parsePath('/2001/12-31/image.jpg/fp=200,100/crop=10,20,30,40');
        expect(crop).toEqual({ x: 10, y: 20, width: 30, height: 40 });
        expect(error).toBeUndefined();
    });

    it('should ignore empty segments', () => {
        const params = parsePath('/2001/12-31/image.jpg/fp=200,100///100x200/');
        expect(params).toEqual({ id: '2001/12-31/image.jpg', focus: { x: 200, y: 100 }, width: 100, height: 200 });
    });

    it('should extract quality parameter', () => {
        const { quality, error } = parsePath('/2001/12-31/image.jpg/q=50');
        expect(quality).toEqual(50);
        expect(error).toBeUndefined();
    });

    it('should extract background parameter', () => {
        const { background, error } = parsePath('/2001/12-31/image.jpg/bg=ff0000/q=50');
        expect(background).toEqual('#ff0000');
        expect(error).toBeUndefined();
    });
});
