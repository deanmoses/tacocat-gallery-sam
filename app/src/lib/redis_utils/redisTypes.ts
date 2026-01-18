import { AlbumThumbnailEntry, GalleryItemType, ImageThumbnailCrop, Size } from '../gallery/galleryTypes';

export type RedisGalleryItem = RedisAlbumItem | RedisMediaItem;
export type RedisMediaItem = RedisImageItem | RedisVideoItem;

/** Album without children */
export type RedisAlbumItem = RedisBaseGalleryRecord & {
    thumbnail?: AlbumThumbnailEntry; // TODO: could compact this down to just 'path'
    published: boolean;
    summary?: string;
};

export type RedisImageItem = RedisBaseGalleryRecord & {
    /**
     * Redis won't find 'pat' in an itemName like 'pat1.jpg', so this is the searchable version of the filename.
     * TODO: consider removing the extension from here and instead adding an 'extension' field represented as a TAG in Redis,
     * to allow searching by jpg/png/etc as well as making the itemNameSearchable field smaller (remove the extension from it).
     */
    itemNameSearchable?: string;
    versionId: string;
    dimensions: Size;
    thumbnail?: ImageThumbnailCrop;
    title?: string;
    tags?: string[];
};

export type RedisVideoItem = RedisBaseGalleryRecord & {
    /** Searchable version of filename */
    itemNameSearchable?: string;
    /** Distinguishes videos from images (both have itemType 'image') */
    mediaType: 'video';
    /** UUID for locating transcoded video and poster in Derived bucket */
    id: string;
    versionId: string;
    dimensions: Size;
    duration: number;
    thumbnail?: ImageThumbnailCrop;
    title?: string;
    tags?: string[];
};

/** Base that albums and images extend */
export type RedisBaseGalleryRecord = {
    parentPath: string; // TODO: could get rid of this b/c it's part of the Redis key
    itemName: string; // TODO: could get rid of this b/c it's part of the Redis key
    itemType: GalleryItemType;
    /** Unix timestamp based on album path rather than createdOn */
    albumDate: number;
    description?: string;
};
