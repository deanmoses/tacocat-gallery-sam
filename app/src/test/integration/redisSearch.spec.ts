import { search } from '../../lib/gallery/search/search';

it('search', async () => {
    const results = await search({ terms: 'soccer', newestYear: '2020' });
    console.log(`Total results: ${results.total}\n`, results.items);
});
