import { search } from '../../lib/gallery/search/search';

it('search', async () => {
    const results = await search({ terms: 'felix', newestYear: '2020', startAt: '0', pageSize: '3' });
    console.log(`Total results: ${results.total}\n`, results.items);
});
