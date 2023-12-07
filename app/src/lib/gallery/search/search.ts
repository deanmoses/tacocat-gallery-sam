import createFuzzySearch, { FuzzyResult } from '@nozbe/microfuzz';
import { AlbumItem, BaseGalleryRecord, ImageItem } from '../galleryTypes';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { getParentAndNameFromPath, toPathFromItem } from '../../gallery_path_utils/galleryPathUtils';

/**
 * Search for images and albums in DynamoDB
 *
 * @param searchTerms string containing search terms like 'milo UCSB'
 */
export async function search(searchTerms: string | undefined): Promise<FuzzyResult<BaseGalleryRecord>[]> {
    console.info(`Search: searching gallery for [${searchTerms}]...`);
    if (!searchTerms) {
        throw new BadRequestException('No search terms supplied');
    }
    if (searchTerms.length < 3) {
        throw new BadRequestException(`Search terms [${searchTerms}]: must be 3 characters or longer`);
    }
    const haystack = await getAllGalleryItems();
    console.info(`Search: retrieved contents of entire DynamoDB table. Item count [${haystack.length}]`);
    let searchResults = searchInHaystack(searchTerms, haystack);
    console.info(`Search: searched gallery for [${searchTerms}].  Item count [${searchResults.length}]`);
    if (!!searchResults) {
        // Remove unpublished albums and images in unpublished albums
        searchResults = searchResults.filter((result) => isPublished(result.item, haystack));
        searchResults = searchResults.map((result) => {
            // add path to each item
            result.item.path = toPathFromItem(result.item);
            // add thumbnail info to albums
            if (result.item.itemType === 'album') {
                addThumbnailInfoToAlbum(result.item as AlbumItem, haystack);
            }
            return result;
        });
    }
    return searchResults;
}

/**
 * Retrieve all albums and images from DynamoDB in a flat list,
 * suitable for passing into the Fuse.js search engine.
 */
async function getAllGalleryItems(): Promise<BaseGalleryRecord[]> {
    console.info(`Search: retrieving contents of entire DynamoDB table...`);
    const ddbCommand = new ScanCommand({
        TableName: getDynamoDbTableName(),
        ProjectionExpression:
            'parentPath, itemName, itemType, versionId, published, title, description, summary, updatedOn, thumbnail, tags',
    });
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const result = await docClient.send(ddbCommand);
    console.info(`Search: retrieved contents of entire DynamoDB table. Item count [${result?.Items?.length}]`);
    return result.Items || [];
}

/**
 * Search over the specified data
 *
 * @param searchTerms string containing search terms like 'milo UCSB'
 * @param haystack data to search over
 */
function searchInHaystack(searchTerms: string, haystack: BaseGalleryRecord[]): FuzzyResult<BaseGalleryRecord>[] {
    const search = createFuzzySearch(haystack, {
        // TODO: don't include album itemNames, just image itemNames
        getText: (item) => [item.itemName, item.title, item.description, item.summary, item?.tags?.toString()],
    });
    return search(searchTerms);
}

/** Retrieve image or album from haystack */
function getItemFromHaystack(haystack: BaseGalleryRecord[], path: string | undefined): BaseGalleryRecord | undefined {
    if (!!path) {
        const pathParths = getParentAndNameFromPath(path);
        return haystack.find((item) => item.parentPath === pathParths.parent && item.itemName === pathParths.name);
    }
}

/** True if album is published or image is in a published album */
function isPublished(item: BaseGalleryRecord, haystack: BaseGalleryRecord[]): boolean {
    return (item.itemType === 'image' && imageIsInPublishedAlbum(item, haystack)) || !!(item as AlbumItem)?.published;
}

/** True if image is in a published album */
function imageIsInPublishedAlbum(image: BaseGalleryRecord, haystack: BaseGalleryRecord[]): boolean {
    const album = getItemFromHaystack(haystack, image.parentPath) as AlbumItem;
    if (!album) console.error(`Did not find album [${image.parentPath}] in haystack}`);
    return !!album?.published;
}

/** Add thumbnail info to album */
function addThumbnailInfoToAlbum(album: AlbumItem, haystack: BaseGalleryRecord[]): void {
    if (!!album.thumbnail?.path) {
        const image = getItemFromHaystack(haystack, album.thumbnail.path) as ImageItem;
        if (!!image) {
            if (image?.versionId) {
                album.thumbnail.versionId = image.versionId;
                if (image.thumbnail) {
                    album.thumbnail.crop = image.thumbnail;
                }
            } else {
                console.error(`Did not find versionId for thumbnail [${album.thumbnail.path}] in haystack}`);
            }
        } else {
            console.log(`Did not find thumbnail [${album.thumbnail.path}] in haystack}`);
        }
    }
}
