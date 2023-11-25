export type Album = AlbumItem &
    Navigable & {
        children?: GalleryItem[];
    };

export type Navigable = {
    prev?: NavInfo;
    next?: NavInfo;
};

/** Just enough information to navigate to a next/prev album or image */
export type NavInfo = {
    path: string;
    title?: string;
};

export type GalleryItem = AlbumItem | ImageItem;

/** Album without children */
export type AlbumItem = BaseGalleryRecord & {
    thumbnail?: AlbumThumbnailEntry;
    summary?: string;
    published?: boolean;
};

export type ImageItem = BaseGalleryRecord & {
    dimensions: Size;
    thumbnail?: ImageThumbnailCrop;
    title?: string;
    tags?: string[];
};

/** Base that albums and images extend */
export type BaseGalleryRecord = {
    path?: string;
    parentPath?: string;
    itemName?: string;
    itemType?: GalleryItemType;
    updatedOn?: string;
    description?: string;
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
    summary?: string;
    published?: boolean;
};

export type ImageUpdateRequest = {
    title?: string;
    description?: string;
    tags?: string[];
};

export type ImageThumbnailCrop = Rectangle;

export type Rectangle = Point & Size;

export type Point = {
    x: number;
    y: number;
};

export type Size = {
    width: number;
    height: number;
};
