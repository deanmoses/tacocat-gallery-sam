import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { search } from '../../lib/gallery/search/search';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import {
    assertDynamoDBItemDoesNotExist,
    assertDynamoDBItemExists,
    cleanUpAlbumAndParents,
} from './helpers/albumHelpers';

const yearAlbumPath = '/1709/'; // unique to this suite to prevent pollution
const albumPath1 = `${yearAlbumPath}05-06/`;
const albumPath2 = `${yearAlbumPath}05-07/`;
const albumPath3 = `${yearAlbumPath}05-08/`;
const searchTerm1 = 'xxxxxx';
const searchTerm2 = 'yyyyyy';
const searchTerm3 = 'zzzzzz';

beforeAll(async () => {
    await Promise.all([
        assertDynamoDBItemDoesNotExist(albumPath1),
        assertDynamoDBItemDoesNotExist(albumPath2),
        assertDynamoDBItemDoesNotExist(albumPath3),
    ]);

    await createAlbum(yearAlbumPath, { published: true });

    await Promise.all([
        createAlbum(albumPath1, { summary: searchTerm1, description: searchTerm2 }),
        createAlbum(albumPath2, { published: true, description: searchTerm3 }),
        createAlbum(albumPath3, { published: true, description: searchTerm3 }),
    ]);

    await Promise.all([
        assertDynamoDBItemExists(albumPath1),
        assertDynamoDBItemExists(albumPath2),
        assertDynamoDBItemExists(albumPath3),
    ]);
});

afterAll(async () => {
    await Promise.allSettled([
        cleanUpAlbumAndParents(albumPath1),
        cleanUpAlbumAndParents(albumPath2),
        cleanUpAlbumAndParents(albumPath3),
    ]);
    await cleanUpAlbumAndParents(yearAlbumPath);
});

it("Shouldn't search unpublished albums", async () => {
    const searchResults = await search(searchTerm1);
    expect(searchResults.length).toBe(0);
});

it('Should search album summaries', async () => {
    await updateAlbum(albumPath1, { published: true });
    const searchResults = await search(searchTerm1);
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].item.path).toBe(albumPath1);
});

it('Should search album descriptions', async () => {
    const searchResults = await search(searchTerm2);
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].item.path).toBe(albumPath1);
});

it('Should return multiple items', async () => {
    const searchResults = await search(searchTerm3);
    expect(searchResults.length).toBe(2);
    expect(searchResults[0].item.description).toBe(searchTerm3);
});

test.todo('Should search image names');
test.todo('Should search image titles');
test.todo('Should search image descriptions');
test.todo('Should search image tags');
test.todo("Shouldn't search images in unpublished albums");
