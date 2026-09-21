import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { cleanUpYear, getAlbumOrFail } from './helpers/fixtures';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.albumNextPrev;
const prevAlbumPath = `${yearPath}06-20/`;
const albumPath = `${yearPath}06-21/`;
const nextAlbumPath = `${yearPath}06-22/`;

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await createAlbum(yearPath, { published: true });
    await Promise.all([
        createAlbum(prevAlbumPath),
        createAlbum(albumPath, { published: true }),
        createAlbum(nextAlbumPath),
    ]);
});

afterAll(() => cleanUpYear(yearPath));

describe('with no published neighbors', () => {
    it('the album has no prev or next', async () => {
        const album = await getAlbumOrFail(albumPath);
        expect(album.prev).toBeUndefined();
        expect(album.next).toBeUndefined();
    });
});

describe('after publishing the previous album', () => {
    beforeAll(() => updateAlbum(prevAlbumPath, { published: true }));

    it('the album has a prev but no next', async () => {
        const album = await getAlbumOrFail(albumPath);
        expect(album.prev?.path).toBe(prevAlbumPath);
        expect(album.next).toBeUndefined();
    });
});

describe('after publishing the next album', () => {
    beforeAll(() => updateAlbum(nextAlbumPath, { published: true }));

    it('the album has both prev and next', async () => {
        const album = await getAlbumOrFail(albumPath);
        expect(album.prev?.path).toBe(prevAlbumPath);
        expect(album.next?.path).toBe(nextAlbumPath);
    });
});
