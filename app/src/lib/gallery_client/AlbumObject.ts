import { Album, AlbumResponse } from '../gallery/galleryTypes';

export function findImage(album: AlbumResponse, imageName: string): Album | undefined {
    return album?.children?.find((child) => child.itemName === imageName);
}
