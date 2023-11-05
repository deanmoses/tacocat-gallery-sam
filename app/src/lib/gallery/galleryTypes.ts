export type AlbumResponse = {
    album?: Album;
    nextAlbum?: string;
    prevAlbum?: string;
    children?: Album[];
};

export type Album = {
    title?: string;
    itemName?: string;
    parentPath?: string;
    thumbnail?: AlbumThumbnailEntry;
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
    tags?: Array<string>;
};

/**
 * Thumbnail crop info
 */
export type Crop = {
    x: number;
    y: number;
    length: number;
};
