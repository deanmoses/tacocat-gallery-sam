import { Album } from '../gallery/galleryTypes';

/**
 * Find image in album by the image's name
 *
 * @param album album object
 * @param imagePath name of image, like image.jpg
 */
export function findImage(album: Album, imageName: string): Album | undefined {
    return album?.children?.find((child) => child.itemName === imageName);
}
