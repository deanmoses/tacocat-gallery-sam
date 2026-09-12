import { deleteMedia } from '../../lib/gallery/deleteMedia/deleteMedia';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { assertDynamoDBItemDoesNotExist, cleanUpAlbumAndParents } from './helpers/albumHelpers';
import {
    assertDerivedImageDoesNotExist,
    assertOriginalImageDoesNotExist,
    derivedImageExists,
    uploadImage,
} from './helpers/s3ImageHelper';

const yearPath = '/1707/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}02-18/`;
const imagePath = `${albumPath}image1.jpg`;
const derivedImageSize = `45x45`;
const galleryAppDomain = process.env.GALLERY_APP_DOMAIN;
if (!galleryAppDomain) throw new Error('GALLERY_APP_DOMAIN environment variable is not set');
let imageVersionId: string;
let derivedImagePath: string;

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);
    await Promise.all([
        assertDynamoDBItemDoesNotExist(albumPath),
        assertOriginalImageDoesNotExist(imagePath),
        assertDerivedImageDoesNotExist(imagePath),
    ]);
    imageVersionId = await uploadImage('image.jpg', imagePath);
    derivedImagePath = `${imagePath}/${imageVersionId}/${derivedImageSize}`;
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
}, 10000 /* increases Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbumAndParents(albumPath);
}, 10000 /* increases Jest's timeout */);

test('Generate derived image should not fail', async () => {
    // Through the CDN, so this keeps working once the Lambda URL requires IAM auth
    const derivedImageGeneratorUrl = `https://img.${galleryAppDomain}/i${imagePath}?version=${imageVersionId}&size=${derivedImageSize}`;
    const response = await fetch(derivedImageGeneratorUrl, { cache: 'no-store' });
    if (response.status !== 200) {
        throw new Error(
            `Error fetching [${derivedImageGeneratorUrl}]: ${response.status} - ${
                response.statusText
            } - ${await response.text()}}`,
        );
    }
}, 15000 /* increases Jest's timeout */);

test('Derived image should exist in S3', async () => {
    if (!(await derivedImageExists(derivedImagePath))) {
        throw new Error(`[${derivedImagePath}] doesn't exist in derived image bucket`);
    }
});

test('Delete image should not fail', async () => {
    await expect(deleteMedia(imagePath)).resolves.not.toThrow();
});

test('Derived image bucket should no longer contain image', async () => {
    if (await derivedImageExists(derivedImagePath))
        throw new Error(`[${derivedImagePath}] should not exist in derived image bucket`);
});
