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

/** A media item is either an image or a video */
export type MediaItem = ImageItem | VideoItem;

/** A gallery item is either an album or a media item (image or video) */
export type GalleryItem = AlbumItem | MediaItem;

/** All possible attribute names across all gallery item types (for DynamoDB projections) */
export type GalleryItemKey = keyof (AlbumItem & ImageItem & VideoItem);

/** Album without children */
export type AlbumItem = BaseGalleryRecord & {
    thumbnail?: AlbumThumbnailEntry;
    summary?: string;
    published?: boolean;
};

export type ImageItem = BaseGalleryRecord & {
    versionId: string;
    dimensions: Size;
    thumbnail?: ImageThumbnailCrop;
    title?: string;
    tags?: string[];
};

export type VideoItem = BaseGalleryRecord & {
    /** Distinguishes video from image (images don't have this field) */
    mediaType: 'video';
    /** UUID for locating transcoded video and poster in Derived bucket */
    id: string;
    versionId: string;
    dimensions: Size;
    /** Duration in seconds */
    duration: number;
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

/**
 * DynamoDB itemType: 'album' or 'image', where 'image' means any media item, including videos
 */
export type GalleryItemType = 'album' | 'image';

/**
 * Distinguishes between differen types of media.
 * Currently there's two types of media: video and image.
 * Only videos have this field; images don't have mediaType yet,
 * beacuse that would require a migration.
 */
export type MediaType = 'video';

export type AlbumThumbnailEntry = {
    path: string;
    versionId: string;
    crop?: Rectangle;
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

export type ImageCreateRequest = ImageUpdateRequest & {
    /** S3 version ID */
    versionId: string;
    dimensions?: Size;
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
