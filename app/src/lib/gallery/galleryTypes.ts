export type AlbumResponse = {
    album?: Album;
    nextAlbum?: string;
    prevAlbum?: string;
    children?: Album[];
};

export type GalleryItemType = 'album' | 'image';

export type GalleryItem = {
    parentPath?: string;
    itemName?: string;
    itemType?: GalleryItemType;
    title?: string;
    description?: string;
    updatedOn?: string;
    thumbnail?: AlbumThumbnailEntry;
    tags?: string[];
    published?: boolean;
};

export type Album = {
    parentPath?: string;
    itemName?: string;
    itemType?: GalleryItemType;
    title?: string;
    description?: string;
    updatedOn?: string;
    thumbnail?: AlbumThumbnailEntry;
    tags?: string[];
    published?: boolean;
};

export type AlbumThumbnailEntry = {
    path: string;
    fileUpdatedOn: string;
};

export type AlbumThumbnailResponse = {
    album?: AlbumThumbnail;
};

export type AlbumThumbnail = {
    title?: string;
    description?: string;
    thumbnail?: AlbumThumbnailEntry;
    itemName?: string;
    parentPath?: string;
    updatedOn?: Date;
};

export type AlbumUpdateRequest = {
    title?: string;
    description?: string;
    published?: boolean;
};

export type ImageUpdateRequest = {
    title?: string;
    description?: string;
    tags?: string[];
};

/**
 * Thumbnail crop info
 */
export type Crop = {
    x: number;
    y: number;
    length: number;
};
