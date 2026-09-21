import { getAlbumOrFail } from './helpers/fixtures';

test('the root album is readable', async () => {
    const album = await getAlbumOrFail('/');

    expect(album.path).toBe('/');
});
