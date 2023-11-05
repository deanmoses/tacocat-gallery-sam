import { AlbumResponse } from '../gallery/galleryTypes';
import { findImage } from './AlbumObject';

describe('findImage()', () => {
    const albumWithMultipleChildren: AlbumResponse = {
        children: [
            {
                itemName: 'image1.jpg',
            },
            {
                itemName: 'image2.jpg',
            },
            {
                itemName: 'image3.jpg',
            },
        ],
    };

    const albumWithoutChildren: AlbumResponse = {
        children: [],
    };

    it('should find image that exists', () => {
        let album = findImage(albumWithMultipleChildren, 'image1.jpg');
        expect(album).toBeDefined();
        expect(album?.itemName).toEqual('image1.jpg');

        album = findImage(albumWithMultipleChildren, 'image2.jpg');
        expect(album).toBeDefined();
        expect(album?.itemName).toEqual('image2.jpg');

        album = findImage(albumWithMultipleChildren, 'image3.jpg');
        expect(album).toBeDefined();
        expect(album?.itemName).toEqual('image3.jpg');
    });

    it("shouldn't find image that doesn't exist", () => {
        let album = findImage(albumWithMultipleChildren, 'image_not_found.jpg');
        expect(album).toBeUndefined();

        album = findImage(albumWithoutChildren, 'image_not_found.jpg');
        expect(album).toBeUndefined();
    });
});
