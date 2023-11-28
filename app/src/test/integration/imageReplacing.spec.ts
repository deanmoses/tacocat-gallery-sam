import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import {
    assertDynamoDBItemDoesNotExist,
    assertDynamoDBItemExists,
    cleanUpAlbum,
    getImageOrThrow,
} from './helpers/albumHelpers';
import { assertOriginalImageDoesNotExist, assertOriginalImageExists, uploadImage } from './helpers/s3ImageHelper';

const yearPath = '/1706/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}07-12/`;

const imageName_noreplace = 'noreplace.jpg';
const imagePath_noreplace = `${albumPath}${imageName_noreplace}`;
const imageName_noreplace_v1 = 'replaceImage/noreplace_metadata_v1.jpg';
const imageName_noreplace_v2 = 'replaceImage/noreplace_metadata_v2.jpg';

const imageName_replace = 'replace.jpg';
const imagePath_replace = `${albumPath}${imageName_replace}`;
const imageName_replace_v1 = 'replaceImage/replace_metadata_v1.jpg';
const imageName_replace_v2 = 'replaceImage/replace_metadata_v2.jpg';

let image_noreplace_versionId1: string;
let image_noreplace_updatedOn1: string | undefined;
let image_replace_versionId1: string;

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath_noreplace)).toBe(true);
    expect(isValidImagePath(imagePath_replace)).toBe(true);

    await assertDynamoDBItemDoesNotExist(yearPath);
    await assertDynamoDBItemDoesNotExist(albumPath);
    await assertOriginalImageDoesNotExist(imagePath_noreplace);
    await assertOriginalImageDoesNotExist(imagePath_replace);

    await uploadImage(imageName_noreplace_v1, imagePath_noreplace);
    await uploadImage(imageName_replace_v1, imagePath_replace);

    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered

    await assertDynamoDBItemExists(albumPath);
    await assertOriginalImageExists(imagePath_noreplace);
    await assertOriginalImageExists(imagePath_replace);
}, 20000 /* increases Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbum(albumPath);
    await cleanUpAlbum(yearPath);
});

// This is test setup but I feel queasy stuffing so much into beforeAll()
test('Album should contain image with full metadata', async () => {
    const image_noreplace = await getImageOrThrow(albumPath, imageName_noreplace);
    expect(image_noreplace.title).toBe('Version 1');
    expect(image_noreplace.description).toBe('Version one.');
    expect(image_noreplace.tags?.sort()).toEqual(['animal', 'boar', 'frog', 'v1'].sort());
    if (!image_noreplace.versionId) throw new Error(`Image [${imageName_noreplace}] has no versionId`);
    image_noreplace_versionId1 = image_noreplace.versionId;
    image_noreplace_updatedOn1 = image_noreplace.updatedOn;
});

// This is test setup but I feel queasy stuffing so much into beforeAll()
test('Album should contain image with no metadata', async () => {
    const image_replace = await getImageOrThrow(albumPath, imageName_replace);
    if (image_replace.title) throw new Error(`Image [${imageName_replace}] has a title: [${image_replace.title}]`);
    if (image_replace.description) throw new Error(`[${imageName_replace}] has a desc: [${image_replace.description}]`);
    if (image_replace.tags?.length) throw new Error(`[${imageName_replace}] has tags: [${image_replace.tags}]`);
    if (!image_replace.versionId) throw new Error(`[${imageName_replace}] has no versionId`);
    image_replace_versionId1 = image_replace.versionId;
});

test('Replace image with full metadata', async () => {
    await expect(uploadImage(imageName_noreplace_v2, imagePath_noreplace)).resolves.not.toThrow();
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
}, 15000 /* increases Jest's timeout */);

test('Image with full metadata should not have changed much', async () => {
    const image_noreplace = await getImageOrThrow(albumPath, imageName_noreplace);
    expect(image_noreplace.title).toBe('Version 1');
    expect(image_noreplace.description).toBe('Version one.');
    expect(image_noreplace.tags?.sort()).toEqual(['animal', 'boar', 'frog', 'v1'].sort());
    if (!image_noreplace.versionId) throw new Error(`Image [${imageName_noreplace}] has no versionId`);
    expect(image_noreplace.versionId).not.toBe(image_noreplace_versionId1);
    expect(image_noreplace.updatedOn).not.toBe(image_noreplace_updatedOn1);
});

test('Replace image with no metadata', async () => {
    await expect(uploadImage(imageName_replace_v2, imagePath_replace)).resolves.not.toThrow();
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
}, 15000 /* increases Jest's timeout */);

test('Image with no metadata should now have some', async () => {
    const image_replace = await getImageOrThrow(albumPath, imageName_replace);
    expect(image_replace.title).toBe('Version 2');
    expect(image_replace.description).toBe('Version two.');
    expect(image_replace.tags?.sort()).toEqual(['forest', 'v2'].sort());
    if (!image_replace.versionId) throw new Error(`Image [${imageName_replace}] has no versionId`);
    expect(image_replace.versionId).not.toBe(image_replace_versionId1);
});
