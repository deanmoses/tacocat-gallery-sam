import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { cleanUpAlbumAndParents } from './helpers/albumHelpers';
import {
    assertDerivedImageDoesNotExist,
    assertOriginalImageDoesNotExist,
    derivedImageExists,
    uploadImage,
} from './helpers/s3ImageHelper';

const yearPath = '/1708/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}02-19/`;
const imagePath = `${albumPath}image1.jpg`;
const imageCdnDomain = 'img.staging-pix.tacocat.com';
const derivedImageSize = `45x45`;
let derivedImageVersionId: string;
let derivedImagePath: string;

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);

    await assertOriginalImageDoesNotExist(imagePath);
    await assertDerivedImageDoesNotExist(imagePath);

    derivedImageVersionId = await uploadImage('image.jpg', imagePath);
    derivedImagePath = `${imagePath}/${derivedImageVersionId}/jpeg/${derivedImageSize}`;

    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
}, 10000 /* increases Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbumAndParents(albumPath);
}, 10000 /* increases Jest's timeout */);

test('Requesting derived image without version or size', async () => {
    const derivedImageUrl = `https://${imageCdnDomain}/i${imagePath}`;
    const response = await fetch(derivedImageUrl, { cache: 'no-store' });
    expect(response.status).toBe(400);
});

test('Requesting derived image without version should fail', async () => {
    const derivedImageUrl = `https://${imageCdnDomain}/i${imagePath}?size=${derivedImageSize}`;
    const response = await fetch(derivedImageUrl, { cache: 'no-store' });
    expect(response.status).toBe(400);
    expect(response.statusText).toMatch(/version/i);
});

test('Requesting derived image without size should fail', async () => {
    const derivedImageUrl = `https://${imageCdnDomain}/i${imagePath}?version=${derivedImageVersionId}`;
    const response = await fetch(derivedImageUrl, { cache: 'no-store' });
    expect(response.status).toBe(400);
    expect(response.statusText).toMatch(/size/i);
});

test('Generate derived image', async () => {
    const derivedImageUrl = `https://${imageCdnDomain}/i${imagePath}?version=${derivedImageVersionId}&size=${derivedImageSize}`;
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
