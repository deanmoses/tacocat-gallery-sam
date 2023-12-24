import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { RedisSearchQuery, SearchResults, searchRedis } from '../../redis_utils/searchRedis';

export async function search(query: SearchQuery): Promise<SearchResults> {
    console.info(`Search: searching gallery for `, query);
    if (!query) throw new BadRequestException('No query supplied');
    const rquery = convertToRedisSearchQuery(query);
    const results = await searchRedis(rquery);
    console.info(
        `Search: searched gallery for `,
        query,
        `Total: [${results.total}], returned: [${results?.items?.length}]}]`,
    );
    return results;
}

function convertToRedisSearchQuery(query: SearchQuery): RedisSearchQuery {
    if (!query.terms) throw new BadRequestException('No search terms supplied');
    const rquery: RedisSearchQuery = {
        terms: query.terms,
        direction: query.oldestFirst ? 'ASC' : 'DESC',
    };
    if (query.oldestYear) {
        rquery.startDate = new Date(query.oldestYear);
    }
    if (query.newestYear) {
        rquery.endDate = new Date(query.newestYear);
    }
    return rquery;
}

export type SearchQuery = {
    terms: string | undefined;
    oldestFirst?: string | undefined;
    /** Leave undefined for both */
    itemType?: 'album' | 'image';
    /** Defaults to 0 20 */
    limit?: { from: number; size: number };
    oldestYear?: string;
    newestYear?: string;
};
