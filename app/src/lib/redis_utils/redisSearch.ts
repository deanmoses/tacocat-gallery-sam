import { SearchOptions as RedisSearchOptions } from 'redis';
import { AlbumItem, GalleryItem, GalleryItemType, ImageItem } from '../gallery/galleryTypes';
import { augmentAlbumThumbnailsWithImageInfo } from '../dynamo_utils/albumThumbnailHelper';
import { createRedisSearchClient } from './redisClientUtils';

/**
 * Search Redis for images and albums
 */
export async function searchRedis(query: RedisSearchQuery): Promise<SearchResults> {
    const results = await doSearch(query);
    await augmentAlbumThumbnailsWithImageInfo(results.items);
    return results;
}

/** Do the actual search */
async function doSearch(query: RedisSearchQuery): Promise<SearchResults> {
    const client = await createRedisSearchClient();
    try {
        const DIRECTION = query.direction || 'DESC';
        const LIMIT = query.limit || { from: 0, size: 40 };
        const searchOptions: RedisSearchOptions = {
            SORTBY: { BY: 'date', DIRECTION },
            LIMIT,
            RETURN: [
                'itemType',
                '$.parentPath',
                '$.itemName',
                '$.versionId',
                '$.thumbnail',
                'title',
                'summary',
                '$.published',
                '$.dimensions',
            ],
        };
        const itemType = query.itemType ? ` @itemType:{${query.itemType}}` : '';
        const range = getRange(query.startDate, query.endDate);
        const results = await client.ft.search('idx:gallery', query.terms + itemType + range, searchOptions);
        return {
            total: results.total,
            items: results.documents.map((doc) => toGalleryItem(doc as unknown as RedisResult)),
        };
    } finally {
        await client.quit();
    }
}

export type RedisSearchQuery = {
    terms: string;
    /** Defaults to DESC */
    direction?: 'ASC' | 'DESC';
    /** Leave undefined for both */
    itemType?: 'album' | 'image';
    /** Defaults to 0 20 */
    limit?: { from: number; size: number };
    startDate?: Date;
    endDate?: Date;
};

export type SearchResults = {
    total: number;
    items: GalleryItem[];
};

// @date:[-952051600000 +inf]
function getRange(startDate: Date | undefined, endDate: Date | undefined): string {
    if (!startDate && !endDate) return '';
    const start = startDate ? startDate.getTime() : '-inf';
    const end = endDate ? endDate.getTime() : '+inf';
    return ` @date:[${start} ${end}]`;
}

function toGalleryItem(doc: RedisResult): GalleryItem {
    switch (doc.value.itemType) {
        case 'album':
            return toAlbumItem(doc);
        case 'image':
            return toImageItem(doc);
        default:
            throw new Error(`Unknown itemType: ${doc.value.itemType}`);
    }
}

function toAlbumItem(doc: RedisResult): AlbumItem {
    const v = doc.value as RedisItem;
    if (!v['$.thumbnail']) throw new Error(`Album ${doc.id} has no thumbnail`);
    const item: AlbumItem = {
        path: doc.id as string,
        parentPath: v['$.parentPath'],
        itemName: v['$.itemName'],
        itemType: 'album',
        published: v['$.published'],
        thumbnail: JSON.parse(v['$.thumbnail']),
    };
    if (v.summary) item.summary = v.summary;
    return item;
}

function toImageItem(doc: RedisResult): ImageItem {
    const v = doc.value as RedisItem;
    const item: ImageItem = {
        path: doc.id as string,
        parentPath: v['$.parentPath'],
        itemName: v['$.itemName'],
        itemType: 'image',
        versionId: v['$.versionId'],
        dimensions: JSON.parse(v['$.dimensions']),
    };
    if (v.title) item.title = v.title;
    if (v['$.thumbnail']) item.thumbnail = JSON.parse(v['$.thumbnail']);
    return item;
}

type RedisResult = {
    id: string;
    value: RedisItem;
};

type RedisItem = {
    ['$.parentPath']: string;
    ['$.itemName']: string;
    itemType: GalleryItemType;
    ['$.versionId']: string;
    ['$.dimensions']: string;
    ['$.thumbnail']?: string;
    ['$.published']?: boolean;
    summary?: string;
    title?: string;
};
