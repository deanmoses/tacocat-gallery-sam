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
};

export type AlbumThumbnailResponse = {
    album?: AlbumThumbnail;
};

export type AlbumThumbnail = {
    title?: string;
    description?: string;
    itemName?: string;
    parentPath?: string;
    itemType?: string;
    updatedOn?: Date;
};
