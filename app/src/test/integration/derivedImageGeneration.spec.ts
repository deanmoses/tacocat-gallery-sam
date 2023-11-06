import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';
import { cleanUpAlbumAndParents } from './helpers/albumHelpers';
import {
    assertDerivedImageDoesNotExist,
    assertOriginalImageDoesNotExist,
    derivedImageExists,
    uploadImage,
} from './helpers/s3ImageHelper';

const yearPath = '/1948/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}02-18/`; // unique to this suite to prevent pollution
const imagePath = `${albumPath}image1.jpg`;
const derivedImagePath = `${imagePath}/jpeg/45x45`;

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);

    await assertOriginalImageDoesNotExist(imagePath);
    await assertDerivedImageDoesNotExist(imagePath);

    await uploadImage('image.jpg', imagePath);
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
}, 10000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbumAndParents(albumPath);
});

test('Generate derived image', async () => {
    const derivedImageBaseUrl = 'https://2ulsytomrhi5tvj7ybwoqd247a0qnbat.lambda-url.us-east-1.on.aws/i';
    const derivedImageUrl = derivedImageBaseUrl + derivedImagePath;
    const response = await fetch(derivedImageUrl, { cache: 'no-store' });
    expect(response.status).toBe(200);
    if (!(await derivedImageExists(derivedImagePath))) {
        throw new Error(`[${derivedImagePath}] doesn't exist in derived image bucket`);
    }
}, 15000 /* increase Jest's timeout */);

test('Delete image', async () => {
    await expect(deleteImage(imagePath)).resolves.not.toThrow();
});

test('Derived image bucket should no longer contain image', async () => {
    if (await derivedImageExists(derivedImagePath))
        throw new Error(`[${derivedImagePath}] should not exist in derived image bucket`);
});
