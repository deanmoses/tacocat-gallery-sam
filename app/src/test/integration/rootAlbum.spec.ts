import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';

test('should be able to retrieve root album', async () => {
    const album = await getAlbumAndChildren('/');
    if (!album) throw new Error('Root album not found');
    expect(album.path).toBe('/');
});
