import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';
import { cleanUpAlbum } from './helpers/albumHelpers';
import {
    assertImageDoesNotExistInDerivedImagesBucket,
    assertImageDoesNotExistInOriginalsBucket,
    imageExistsInDerivedImagesBucket,
    uploadImage,
} from './helpers/s3ImageHelper';

const yearPath = '/1950/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}02-18/`; // unique to this suite to prevent pollution
const imagePath = `${albumPath}image1.jpg`;

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);
    await assertImageDoesNotExistInOriginalsBucket(imagePath);
    await assertImageDoesNotExistInDerivedImagesBucket(imagePath);

    await uploadImage('image.jpg', imagePath);
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
}, 10000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbum(albumPath);
    await cleanUpAlbum(yearPath);
});

test('Generate derived image', async () => {
    const derivedImagePath = `${imagePath}/jpeg/45x45`;
    const derivedImageBaseUrl = 'https://2ulsytomrhi5tvj7ybwoqd247a0qnbat.lambda-url.us-east-1.on.aws/i';
    const derivedImageUrl = derivedImageBaseUrl + derivedImagePath;
    const response = await fetch(derivedImageUrl, { cache: 'no-store' });
    expect(response.status).toBe(200);
    if (!(await imageExistsInDerivedImagesBucket(derivedImagePath))) {
        throw new Error(`[${derivedImagePath}] doesn't exist in derived image bucket`);
    }
}, 15000 /* increase Jest's timeout */);
