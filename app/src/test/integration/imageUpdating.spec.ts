import { ImageItem } from '../../lib/gallery/galleryTypes';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { updateImage } from '../../lib/gallery/updateImage/updateImage';
import { findImage } from '../../lib/gallery_client/AlbumObject';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import {
    assertDynamoDBItemDoesNotExist,
    assertDynamoDBItemExists,
    cleanUpAlbumAndParents,
} from './helpers/albumHelpers';
import { reallyGetNameFromPath } from './helpers/pathHelpers';
import { assertOriginalImageDoesNotExist, assertOriginalImageExists, uploadImage } from './helpers/s3ImageHelper';

const albumPath = '/1705/04-26/'; // unique to this suite to prevent pollution
let imagePath: string;
let title: string;
let description: string;

beforeAll(async () => {
    imagePath = `${albumPath}image_${Date.now()}.jpg`; // unique to this test run to prevent collision with bad cleanup of prior tests
    title = `Title [${Date.now}]`;
    description = `Description [${Date.now}]`;

    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);

    await assertDynamoDBItemDoesNotExist(albumPath);
    await assertOriginalImageDoesNotExist(imagePath);

    await uploadImage('image.jpg', imagePath);
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered

    await assertDynamoDBItemExists(albumPath);
    await assertOriginalImageExists(imagePath);
}, 10000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbumAndParents(albumPath);
});

it('set title', async () => {
    const image = await doUpdate({ title: title });
    expect(image.title).toBe(title);
});

it('set description', async () => {
    const image = await doUpdate({ description: description });
    expect(image.title).toBe(title);
    expect(image.description).toBe(description);
});

it('unset title', async () => {
    const image = await doUpdate({ title: '' });
    expect(image.title).toBe('');
    expect(image.description).toBe(description);
});

it('unset description', async () => {
    const image = await doUpdate({ description: '' });
    expect(image.title).toBe('');
    expect(image.description).toBe('');
});

it('set title & description', async () => {
    const image = await doUpdate({ title: title, description: description });
    expect(image.title).toBe(title);
    expect(image.description).toBe(description);
});

async function doUpdate(attributesToUpdate: Record<string, string | boolean>): Promise<ImageItem> {
    await updateImage(imagePath, attributesToUpdate);
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error(`No album for [${albumPath}]`);
    const imageName = reallyGetNameFromPath(imagePath);
    const image = findImage(album, imageName);
    if (!image) throw new Error(`No image [${imageName}] in [${albumPath}]`);
    return image;
}
