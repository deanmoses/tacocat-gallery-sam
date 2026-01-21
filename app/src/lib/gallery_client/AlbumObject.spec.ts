import { Album } from '../gallery/galleryTypes';
import { findMedia } from './AlbumObject';

describe('findMedia()', () => {
    const albumWithMultipleChildren: Album = {
        itemType: 'album',
        children: [
            {
                itemType: 'image',
                itemName: 'image1.jpg',
            },
            {
                itemType: 'image',
                itemName: 'image2.jpg',
            },
            {
                itemType: 'image',
                itemName: 'image3.jpg',
            },
        ],
    } as Album;

    const albumWithoutChildren: Album = {
        itemType: 'album',
        children: [],
    };

    it('should find image that exists', () => {
        let album = findMedia(albumWithMultipleChildren, 'image1.jpg');
        expect(album).toBeDefined();
        expect(album?.itemName).toEqual('image1.jpg');

        album = findMedia(albumWithMultipleChildren, 'image2.jpg');
        expect(album).toBeDefined();
        expect(album?.itemName).toEqual('image2.jpg');

        album = findMedia(albumWithMultipleChildren, 'image3.jpg');
        expect(album).toBeDefined();
        expect(album?.itemName).toEqual('image3.jpg');
    });

    it("shouldn't find image that doesn't exist", () => {
        let album = findMedia(albumWithMultipleChildren, 'image_not_found.jpg');
        expect(album).toBeUndefined();

        album = findMedia(albumWithoutChildren, 'image_not_found.jpg');
        expect(album).toBeUndefined();
    });
});
