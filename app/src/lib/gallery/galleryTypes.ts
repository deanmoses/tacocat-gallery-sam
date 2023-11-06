export type AlbumResponse = {
    album?: Album;
    nextAlbum?: string;
    prevAlbum?: string;
    children?: Album[];
};

export enum GalleryItemType {
    album = 'album',
    image = 'image',
}
export type Album = {
    title?: string;
    description?: string;
    itemType?: GalleryItemType;
    itemName?: string;
    parentPath?: string;
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
