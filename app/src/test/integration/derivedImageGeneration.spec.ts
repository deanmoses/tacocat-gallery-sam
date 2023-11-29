import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { getDerivedImageDomain } from '../../lib/lambda_utils/Env';
import { cleanUpAlbumAndParents } from './helpers/albumHelpers';
import {
    assertDerivedImageDoesNotExist,
    assertOriginalImageDoesNotExist,
    derivedImageExists,
    uploadImage,
} from './helpers/s3ImageHelper';

const yearPath = '/1707/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}02-18/`;
const imagePath = `${albumPath}image1.jpg`;
const derivedImageSuffix = `jpeg/45x45`;
let derivedImagePath: string;

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);

    await assertOriginalImageDoesNotExist(imagePath);
    await assertDerivedImageDoesNotExist(imagePath);

    const imageVersionId = await uploadImage('image.jpg', imagePath);
    derivedImagePath = `${imagePath}/${imageVersionId}/${derivedImageSuffix}`;

    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
}, 10000 /* increases Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbumAndParents(albumPath);
}, 10000 /* increases Jest's timeout */);

test('Generate derived image', async () => {
    const derivedImageUrl = `https://${getDerivedImageDomain()}/i${derivedImagePath}`;
    const response = await fetch(derivedImageUrl, { cache: 'no-store' });
    if (response.status !== 200)
        throw new Error(
            `Error fetching [${derivedImageUrl}]: ${response.status} - ${
                response.statusText
            } - ${await response.text()}}`,
        );
    if (!(await derivedImageExists(derivedImagePath))) {
        throw new Error(`[${derivedImagePath}] doesn't exist in derived image bucket`);
    }
}, 15000 /* increases Jest's timeout */);

test('Delete image', async () => {
    await expect(deleteImage(imagePath)).resolves.not.toThrow();
});

test('Derived image bucket should no longer contain image', async () => {
    if (await derivedImageExists(derivedImagePath))
        throw new Error(`[${derivedImagePath}] should not exist in derived image bucket`);
});
