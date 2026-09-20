import { updateMedia } from '../../lib/gallery/updateMedia/updateMedia';
import { cleanUpYear, getMediaOrFail, setUpAlbumWithImages } from './helpers/fixtures';
import { TEST_YEARS } from './helpers/testYears';

const yearPath = TEST_YEARS.mediaUpdating;
const albumPath = `${yearPath}04-26/`;
const imagePath = `${albumPath}image.jpg`;
const title = `Title ${Date.now()}`;
const description = `Description ${Date.now()}`;
let titleSetOn: string | undefined;

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await setUpAlbumWithImages(albumPath, { 'image.jpg': 'images/image.jpg' });
});

afterAll(() => cleanUpYear(yearPath));

describe('after setting the title', () => {
    beforeAll(() => updateMedia(imagePath, { title }));

    test('it is set', async () => {
        const image = await getMediaOrFail(imagePath);
        expect(image.title).toBe(title);
        expect(image.updatedOn).toBeDefined();
        titleSetOn = image.updatedOn;
    });
});

describe('after setting the description', () => {
    beforeAll(() => updateMedia(imagePath, { description }));

    test('it is set, the title is kept and updatedOn moved', async () => {
        const image = await getMediaOrFail(imagePath);
        expect(image.description).toBe(description);
        expect(image.title).toBe(title);
        expect(image.updatedOn).not.toBe(titleSetOn);
    });
});

describe('after clearing the title and then the description', () => {
    beforeAll(async () => {
        await updateMedia(imagePath, { title: '' });
        await updateMedia(imagePath, { description: '' });
    });

    test('both are empty', async () => {
        const image = await getMediaOrFail(imagePath);
        expect(image.title).toBe('');
        expect(image.description).toBe('');
    });
});

describe('after setting title and description in one update', () => {
    beforeAll(() => updateMedia(imagePath, { title, description }));

    test('both are set', async () => {
        const image = await getMediaOrFail(imagePath);
        expect(image.title).toBe(title);
        expect(image.description).toBe(description);
    });
});
