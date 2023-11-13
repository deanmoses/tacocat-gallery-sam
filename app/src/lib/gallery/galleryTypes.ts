export type Album = GalleryItem &
    Navigable & {
        summary?: string;
        children?: GalleryItem[];
    };

export type Navigable = {
    prev?: NavInfo;
    next?: NavInfo;
};

/**
 * Just enough information to navigate to a next/prev album or image
 */
export type NavInfo = {
    path: string;
    title?: string;
};

export type GalleryItem = {
    path?: string;
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

export type GalleryItemType = 'album' | 'image';

export type AlbumThumbnailEntry = {
    path: string;
    fileUpdatedOn: string;
};

export type AlbumThumbnail = {
    path?: string;
    parentPath?: string;
    itemName?: string;
    title?: string;
    description?: string;
    updatedOn?: Date;
    thumbnail?: AlbumThumbnailEntry;
};

export type AlbumUpdateRequest = {
    title?: string;
    description?: string;
    published?: boolean;
    // TODO: tags
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
