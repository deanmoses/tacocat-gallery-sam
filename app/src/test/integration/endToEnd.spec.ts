import { createAlbumNoThrow } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';
import { deleteMedia } from '../../lib/gallery/deleteMedia/deleteMedia';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import {
    getParentAndNameFromPath,
    isValidAlbumPath,
    isValidImagePath,
} from '../../lib/gallery_path_utils/galleryPathUtils';
import { cleanUpAlbumAndParents } from './helpers/albumHelpers';
import { uploadImage } from './helpers/s3ImageHelper';

const albumPath = '/1709/10-01/'; // unique to this suite to prevent pollution
const imagePath = albumPath + 'image.jpg';

beforeAll(async () => {
    // Clean up leftover data from previous failed runs
    await cleanUpAlbumAndParents(albumPath);
});

afterAll(async () => {
    await cleanUpAlbumAndParents(albumPath);
});

test('validate test setup', async () => {
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);
});

describe('create', () => {
    describe('album', () => {
        test('createAlbum()', async () => {
            await expect(createAlbumNoThrow(albumPath)).resolves.toBe(true);
        });
    });

    describe('image', () => {
        test('upload image', async () => {
            await uploadImage('image.jpg', imagePath);
        });

        test('new image exists in DynamoDB', async () => {
            // wait for the image processing lambda to trigger
            // TODO: I would love to implement push notifications so these tests become deterministic
            await new Promise((r) => setTimeout(r, 4000));

            await expect(itemExists(imagePath)).resolves.toBe(true);
        }, 10000 /* increase Jest's timeout */);

        test('getAlbum() contains new image', async () => {
            const album = await getAlbumAndChildren(albumPath, true /* include unpublished */);
            if (!album) throw new Error(`No album`);

            const albumPathParts = getParentAndNameFromPath(albumPath);
            expect(album?.itemName).toBe(albumPathParts.name);
            expect(album?.parentPath).toBe(albumPathParts.parent);

            if (!album.children) throw new Error('no children');
            const imagePathParts = getParentAndNameFromPath(imagePath);
            const theChild = album.children.find((child) => child.itemName === imagePathParts.name);
            if (!theChild) throw new Error(`Did not find child image`);
            expect(theChild?.parentPath).toBe(imagePathParts.parent);
        });

        test.todo('retrieve sized image');
        test.todo('sized image exists in derived images bucket');
    });
});

describe('update', () => {
    test.todo('updateAlbum()');
    test.todo('updateMedia()');
});

describe('delete', () => {
    test('deleteAlbum() fails when not empty', async () => {
        await expect(deleteAlbum(albumPath)).rejects.toThrow(/child/i);
    });

    describe('deleteMedia()', () => {
        test('delete all images in album', async () => {
            const children = (await getAlbumAndChildren(albumPath, true /* include unpublished */))?.children;
            if (!children) throw new Error('no children');
            for (const child of children) {
                if (!child.parentPath) throw 'child has no parent path';
                const childPath = child.parentPath + child.itemName;
                await expect(deleteMedia(childPath)).resolves.not.toThrow();
            }
        }, 15000 /* increase Jest's timeout */);

        test('album no longer contains children', async () => {
            const album = await getAlbumAndChildren(albumPath, true /* include unpublished */);
            if (!album) throw new Error(`No album results`);
            expect(album?.children?.length).toBe(0);
        });
    });

    test('deleteAlbum() succeeds when empty', async () => {
        await expect(deleteAlbum(albumPath)).resolves.not.toThrow();
    });
});
