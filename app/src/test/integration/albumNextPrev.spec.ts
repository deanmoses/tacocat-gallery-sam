import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { assertDynamoDBItemDoesNotExist, cleanUpAlbum } from './helpers/albumHelpers';

const yearPath = '/1716/'; // unique to this suite to prevent pollution
const prevAlbumPath = `${yearPath}06-20/`;
const currentAlbumPath = `${yearPath}06-21/`;
const nextAlbumPath = `${yearPath}06-22/`;

beforeAll(async () => {
    await Promise.all([
        assertDynamoDBItemDoesNotExist(prevAlbumPath),
        assertDynamoDBItemDoesNotExist(currentAlbumPath),
        assertDynamoDBItemDoesNotExist(nextAlbumPath),
    ]);
    await Promise.all([
        createAlbum(yearPath),
        createAlbum(prevAlbumPath),
        createAlbum(currentAlbumPath, { published: true }),
        createAlbum(nextAlbumPath),
    ]);
}, 20000 /* increase Jest's timeout */);

afterAll(async () => {
    await Promise.allSettled([
        cleanUpAlbum(prevAlbumPath),
        cleanUpAlbum(currentAlbumPath),
        cleanUpAlbum(nextAlbumPath),
    ]);
    await cleanUpAlbum(yearPath);
}, 20000 /* increase Jest's timeout */);

test('no published peers, no prev/next', async () => {
    const album = await getAlbumAndChildren(currentAlbumPath);
    if (!album) throw new Error(`No album`);
    expect(album?.next).toBeUndefined();
    expect(album?.prev).toBeUndefined();
});

test('prev', async () => {
    await updateAlbum(prevAlbumPath, { published: true });
    const album = await getAlbumAndChildren(currentAlbumPath);
    if (!album) throw new Error(`No album`);
    expect(album?.prev?.path).toBe(prevAlbumPath);
    expect(album?.next).toBeUndefined();
});

test('prev & next', async () => {
    await updateAlbum(nextAlbumPath, { published: true });
    const album = await getAlbumAndChildren(currentAlbumPath);
    if (!album) throw new Error(`No album`);
    expect(album?.next?.path).toBe(nextAlbumPath);
    expect(album?.prev?.path).toBe(prevAlbumPath);
});
