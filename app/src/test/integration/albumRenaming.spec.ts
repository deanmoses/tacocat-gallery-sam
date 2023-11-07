import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { renameAlbum } from '../../lib/gallery/renameAlbum/renameAlbum';
import { setAlbumThumbnail } from '../../lib/gallery/setAlbumThumbnail/setAlbumThumbnail';
import { getParentFromPath } from '../../lib/gallery_path_utils/getParentFromPath';
import {
    assertDynamoDBItemDoesNotExist,
    assertDynamoDBItemExists,
    cleanUpAlbum,
    cleanUpAlbumAndParents,
} from './helpers/albumHelpers';
import { assertIsValidAlbumPath, assertIsValidImagePath, assertIsValidYearAlbumPath } from './helpers/pathHelpers';
import { assertOriginalImageExists, originalImageExists, uploadImage } from './helpers/s3ImageHelper';

const yearAlbumPath = '/1711/'; // should be unique to this suite to prevent pollution
const oldAlbumName = '01-17';
const newAlbumName = '01-18';
const anotherAlbumName = '01-19';
const oldAlbumPath = `${yearAlbumPath}${oldAlbumName}/`;
const newAlbumPath = `${yearAlbumPath}${newAlbumName}/`;
const anotherAlbumPath = `${yearAlbumPath}${anotherAlbumName}/`;
let imageName: string;
let imagePath: string;

beforeAll(async () => {
    imageName = `image1_${Date.now()}.jpg`; // unique to this test run to prevent test from not being able to run again on failure to clean up properly
    imagePath = `${oldAlbumPath}${imageName}`; // unique to this test run to prevent test from not being able to run again on failure to clean up properly

    assertIsValidYearAlbumPath(yearAlbumPath);
    assertIsValidAlbumPath(oldAlbumPath);
    assertIsValidAlbumPath(newAlbumPath);
    assertIsValidAlbumPath(anotherAlbumPath);
    assertIsValidImagePath(imagePath);

    await assertDynamoDBItemDoesNotExist(oldAlbumPath);
    await assertDynamoDBItemDoesNotExist(newAlbumPath);
    await assertDynamoDBItemDoesNotExist(anotherAlbumPath);
    await assertDynamoDBItemDoesNotExist(imagePath);

    await uploadImage('image.jpg', imagePath);
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
    await assertDynamoDBItemExists(oldAlbumPath);
    await assertDynamoDBItemExists(imagePath);
    await assertOriginalImageExists(imagePath);

    await createAlbum(anotherAlbumPath);

    // Set image as thumbnail of immediate parent album
    await setAlbumThumbnail(
        oldAlbumPath,
        imagePath,
        false /* Since the first uploaded image may have set this, don't error */,
    );

    // Set image as thumbnail of grandparent album
    await setAlbumThumbnail(
        getParentFromPath(oldAlbumPath),
        imagePath,
        false /* Since the first uploaded image may have set this, don't error */,
    );
}, 25000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbum(anotherAlbumPath);
    await cleanUpAlbum(newAlbumPath);
    await cleanUpAlbumAndParents(oldAlbumPath);
}, 20000 /* increase Jest's timeout */);

test('Cannot rename to same name', async () => {
    await expect(renameAlbum(oldAlbumPath, oldAlbumName)).rejects.toThrow(/same/i);
});

test('Cannot rename to same name as an existing album', async () => {
    await expect(renameAlbum(oldAlbumPath, anotherAlbumName)).rejects.toThrow(/exists/i);
});

test('Do the rename', async () => {
    await expect(renameAlbum(oldAlbumPath, newAlbumName)).resolves.not.toThrow();
});

test('Originals bucket should contain new image', async () => {
    await expect(originalImageExists(newAlbumPath + imageName)).resolves.toBe(true);
});

test('Originals bucket should not contain old image', async () => {
    await expect(originalImageExists(imagePath)).resolves.toBe(false);
});

test.todo('GetAlbum() should reflect rename');

test.todo("Grandparent album's thumbnail entry should reflect the image rename");
