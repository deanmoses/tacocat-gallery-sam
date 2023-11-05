import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbumAndChildren';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { findImage } from '../../lib/gallery_client/AlbumObject';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';
import { cleanUpAlbum } from './helpers/albumHelpers';
import { reallyGetNameFromPath } from './helpers/pathHelpers';
import { imageExistsInOriginalsBucket, uploadImage } from './helpers/s3ImageHelper';

const yearPath = '/1951/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}09-02/`; // unique to this suite to prevent pollution
const imagePath = `${albumPath}image1.jpg`;

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);

    if (await itemExists(yearPath)) throw new Error(`Album [${yearPath}] cannot exist at start of suite`);
    if (await itemExists(albumPath)) throw new Error(`Album [${albumPath}] cannot exist at start of suite`);
    if (await imageExistsInOriginalsBucket(imagePath))
        throw new Error(`Image [${imagePath}] cannot exist in S3 at start of suite`);

    await uploadImage('image.jpg', imagePath);
    await new Promise((r) => setTimeout(r, 4000)); // wait for image processing lambda to be triggered
}, 10000 /* increase Jest's timeout */);

afterAll(async () => {
    await cleanUpAlbum(albumPath);
    await cleanUpAlbum(yearPath);
});

test('Parent album was created', async () => {
    if (!(await itemExists(albumPath))) throw new Error(`Album [${albumPath}] does not exist`);
});

test('Granparent album was created', async () => {
    if (!(await itemExists(yearPath))) throw new Error(`Album [${yearPath}] does not exist`);
});

test('Album contains image', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw 'no album';
    const imageName = reallyGetNameFromPath(imagePath);
    const image = findImage(album, imageName);
    if (!image) throw new Error(`Did not find child image`);
    expect(image?.parentPath).toBe(albumPath);
    expect(image.itemName).toBe(imageName);
    expect(image.title).toBe('Image Title');
});

test.todo('Test that image uploaded created the correct tags from the IPTC metadata');
