import { Album, AlbumItem, ImageItem } from '../gallery/galleryTypes';

/**
 * Find image in album by the image's name
 *
 * @param album album object
 * @param imagePath name of image, like image.jpg
 */
export function findImage(album: Album | undefined, imageName: string | undefined): ImageItem | undefined {
    return album?.children?.find((child) => child.itemName === imageName) as ImageItem;
}

/**
 * Find sub-album in album by the album's path
 *
 * @param album album object
 * @param albumName name of album, like 12-31
 */
export function findSubAlbum(album: Album | undefined, albumName: string | undefined): AlbumItem | undefined {
    return album?.children?.find((child) => child.itemName === albumName) as AlbumItem;
}
