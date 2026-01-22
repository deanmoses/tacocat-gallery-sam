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
    itemType: 'album';
    thumbnail?: AlbumThumbnailEntry;
    summary?: string;
    published?: boolean;
};

export type ImageItem = BaseMediaItem;

export type VideoItem = BaseMediaItem & {
    /**
     * Distinguishes video from image
     * Images don't have this field until we run a migration
     */
    mediaType: 'video';
    /** Duration in seconds */
    duration: number;
};

/** Base type with fields common to all media items (images and videos) */
export type BaseMediaItem = BaseGalleryRecord & {
    /**
     * 'image' means 'media item' (image or video).
     * Will be renamed to 'media' in a future migration.
     */
    itemType: 'image';
    versionId: string;
    dimensions: Size;
    thumbnail?: ImageThumbnailCrop;
    title?: string;
    tags?: string[];
};

/** Base type with fields common to all gallery items (albums, media) */
export type BaseGalleryRecord = {
    path?: string;
    parentPath?: string;
    itemName?: string;
    itemType?: GalleryItemType;
    updatedOn?: string;
    description?: string;
};

/**
 * DynamoDB itemType: 'album' or 'image', where 'image' means any media item, including videos.
 * We will run a migration in the future to rename 'image' to 'media'.
 */
export type GalleryItemType = 'album' | 'image';

/**
 * Distinguishes between different types of media.
 * Currently there's two types of media: video and image.
 * Only videos have this field; images don't have mediaType yet,
 * because that would require a migration.
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
