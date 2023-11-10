import createFuzzySearch, { FuzzyResult } from '@nozbe/microfuzz';
import { GalleryItem } from '../galleryTypes';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { toPathFromItem } from '../../gallery_path_utils/galleryPathUtils';

/**
 * Search for images and albums in DynamoDB
 *
 * @param searchTerms string containing search terms like 'milo UCSB'
 */
export async function search(searchTerms: string | undefined): Promise<FuzzyResult<GalleryItem>[]> {
    console.info(`Search: searching gallery for [${searchTerms}]...`);
    if (!searchTerms) {
        throw new BadRequestException('No search terms supplied');
    }
    if (searchTerms.length < 3) {
        throw new BadRequestException(`Search terms [${searchTerms}]: must be 3 characters or longer`);
    }
    const haystack = await getAllGalleryItems();
    let searchResults = searchInHaystack(searchTerms, haystack);
    console.info(`Search: searched gallery for [${searchTerms}].  Item count [${searchResults.length}]`);
    if (!!searchResults) {
        searchResults = searchResults.map((result) => {
            result.item.path = toPathFromItem(result.item);
            return result;
        });
    }
    return searchResults;
}

/**
 * Search over the specified data
 *
 * @param searchTerms string containing search terms like 'milo UCSB'
 * @param haystack data to search over
 */
function searchInHaystack(searchTerms: string, haystack: GalleryItem[]): FuzzyResult<GalleryItem>[] {
    const search = createFuzzySearch(haystack, {
        getText: (item) => [item.itemName, item.title, item.description, item?.tags?.toString()],
    });
    return search(searchTerms);
}

/**
 * Retrieve all albums and images from DynamoDB in a flat list,
 * suitable for passing into the Fuse.js search engine.
 */
async function getAllGalleryItems(): Promise<GalleryItem[]> {
    console.info(`Search: retrieving contents of entire DynamoDB table...`);
    const ddbCommand = new ScanCommand({
        TableName: getDynamoDbTableName(),
        ProjectionExpression: 'parentPath, itemName, itemType, title, description, updatedOn, thumbnail, tags',
    });
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    const result = await docClient.send(ddbCommand);
    console.info(`Search: retrieved contents of entire DynamoDB table. Item count [${result?.Items?.length}]`);
    //console.info('Scan results: ', JSON.stringify(result));
    return result.Items || [];
}
