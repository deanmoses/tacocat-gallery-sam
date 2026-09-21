import { search } from './search';
import * as redisSearch from '../../redis_utils/redisSearch';
import { BadRequestException } from '../../lambda_utils/BadRequestException';

jest.mock('../../redis_utils/redisSearch');

const mockSearchRedis = jest.mocked(redisSearch.searchRedis);
const noResults = { total: 0, items: [] };

beforeEach(() => {
    mockSearchRedis.mockResolvedValue(noResults);
});

describe('search()', () => {
    it('rejects a query without terms', async () => {
        await expect(search({ terms: undefined })).rejects.toThrow(BadRequestException);
        await expect(search({ terms: '' })).rejects.toThrow(/terms/i);
        expect(mockSearchRedis).not.toHaveBeenCalled();
    });

    it('searches newest first, thirty at a time, over all dates by default', async () => {
        await search({ terms: 'beach' });

        expect(mockSearchRedis).toHaveBeenCalledWith({
            terms: 'beach',
            direction: 'DESC',
            limit: { from: 0, size: 30 },
        });
    });

    it('returns what Redis found', async () => {
        const results = { total: 1, items: [{ path: '/2001/12-31/image.jpg' }] } as redisSearch.SearchResults;
        mockSearchRedis.mockResolvedValue(results);

        await expect(search({ terms: 'beach' })).resolves.toBe(results);
    });

    it('sorts oldest first when asked', async () => {
        await search({ terms: 'beach', oldestFirst: 'true' });

        expect(mockSearchRedis).toHaveBeenCalledWith(expect.objectContaining({ direction: 'ASC' }));
    });

    it('pages with the numbers the query string carries', async () => {
        await search({ terms: 'beach', startAt: '60', pageSize: '20' });

        expect(mockSearchRedis).toHaveBeenCalledWith(expect.objectContaining({ limit: { from: 60, size: 20 } }));
    });

    it('starts the date range at the first instant of the oldest year', async () => {
        await search({ terms: 'beach', oldestYear: '1999' });

        const query = mockSearchRedis.mock.calls[0][0];

        expect(query.startDate).toStrictEqual(new Date('1999'));
        expect(query.endDate).toBeUndefined();
    });

    it('ends the date range at the last second of the newest year', async () => {
        await search({ terms: 'beach', newestYear: '2005' });

        const query = mockSearchRedis.mock.calls[0][0];

        expect(query.startDate).toBeUndefined();
        expect(query.endDate).toStrictEqual(new Date(2005, 11, 31, 23, 59, 59));
    });

    it('bounds the date range on both ends', async () => {
        await search({ terms: 'beach', oldestYear: '1999', newestYear: '2005' });

        const query = mockSearchRedis.mock.calls[0][0];

        expect(query.startDate?.getUTCFullYear()).toBe(1999);
        expect(query.endDate?.getFullYear()).toBe(2005);
    });

    it('never asks Redis to filter by item type', async () => {
        // The gallery app has no way to ask for it, and the query type does not carry it through
        await search({ terms: 'beach', itemType: 'album' });

        expect(mockSearchRedis.mock.calls[0][0]).not.toHaveProperty('itemType');
    });
});
