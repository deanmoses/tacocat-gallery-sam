import { isValidAlbumPath } from './pathValidator';

describe('isValidAlbumPath', () => {
    const badAlbumPaths = [
        'notapath',
        '/not/a/real/path',
        '',
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
    badAlbumPaths.forEach((path) => {
        it(`Path should be invalid: [${path}]`, () => {
            expect(isValidAlbumPath(path)).toStrictEqual(false);
        });
    });

    const goodAlbumPaths = ['/', '/2001/', '/2030/01-01/'];
    goodAlbumPaths.forEach((path) => {
        it(`Path should be valid: [${path}]`, () => {
            expect(isValidAlbumPath(path)).toStrictEqual(true);
        });
    });
});
