import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { assertDynamoDBItemDoesNotExist } from './helpers/albumHelpers';

const yearPath = '/1716/'; // unique to this suite to prevent pollution
const prevAlbumPath = `${yearPath}06-20/`;
const currentAlbumPath = `${yearPath}06-21/`;
const nextAlbumPath = `${yearPath}06-22/`;

beforeAll(async () => {
    await assertDynamoDBItemDoesNotExist(prevAlbumPath);
    await assertDynamoDBItemDoesNotExist(currentAlbumPath);
    await assertDynamoDBItemDoesNotExist(nextAlbumPath);

    await createAlbum(yearPath);
    await createAlbum(prevAlbumPath);
    await createAlbum(currentAlbumPath);
    await createAlbum(nextAlbumPath);
});

afterAll(async () => {
    await deleteAlbum(yearPath);
    await deleteAlbum(prevAlbumPath);
    await deleteAlbum(currentAlbumPath);
    await deleteAlbum(nextAlbumPath);
});

test('no published peers, no prev/next', async () => {
    const album = await getAlbumAndChildren(currentAlbumPath);
    if (!album) throw new Error(`No album`);
    expect(album?.nextAlbum).toBeUndefined();
    expect(album?.prevAlbum).toBeUndefined();
});

test('prev', async () => {
    await updateAlbum(prevAlbumPath, { published: true });
    const album = await getAlbumAndChildren(currentAlbumPath);
    if (!album) throw new Error(`No album`);
    expect(album?.prevAlbum?.path).toBe(prevAlbumPath);
    expect(album?.nextAlbum).toBeUndefined();
});

test('prev & next', async () => {
    await updateAlbum(nextAlbumPath, { published: true });
    const album = await getAlbumAndChildren(currentAlbumPath);
    if (!album) throw new Error(`No album`);
    expect(album?.nextAlbum?.path).toBe(nextAlbumPath);
    expect(album?.prevAlbum?.path).toBe(prevAlbumPath);
});
