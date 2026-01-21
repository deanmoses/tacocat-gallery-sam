import { Album, AlbumItem, ImageItem, VideoItem } from '../gallery/galleryTypes';

/**
 * Find media in album by the media's name
 *
 * @param album album object
 * @param mediaName name of media, like image.jpg or video.mp4
 */
export function findMedia(album: Album | undefined, mediaName: string | undefined): ImageItem | VideoItem | undefined {
    return album?.children?.find((child) => child.itemName === mediaName) as ImageItem | VideoItem | undefined;
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
