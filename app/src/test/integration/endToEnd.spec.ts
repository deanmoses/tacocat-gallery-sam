import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';
import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbumAndChildren';
import { getLatestAlbum } from '../../lib/gallery/getLatestAlbum/getLatestAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { getNameFromPath } from '../../lib/gallery_path_utils/getNameFromPath';
import { getParentAndNameFromPath } from '../../lib/gallery_path_utils/getParentAndNameFromPath';
import { isValidAlbumPath, isValidImagePath } from '../../lib/gallery_path_utils/pathValidator';
import { getAlbumPathForToday, getUniqueImagePathForToday } from './helpers/pathHelpers';
import { uploadImage } from './helpers/s3ImageHelper';

let albumPath: string;
let imagePath: string;

beforeAll(() => {
    albumPath = getAlbumPathForToday(); // use current year so that getLatestAlbum will always return something
    imagePath = getUniqueImagePathForToday();
});

test('validate test setup', async () => {
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidImagePath(imagePath)).toBe(true);
});

describe('create', () => {
    describe('album', () => {
        test('createAlbum()', async () => {
            if (await itemExists(albumPath)) {
                console.info(`Album [${albumPath}] already exists, skipping creation`);
            } else {
                await expect(createAlbum(albumPath)).resolves.not.toThrow();
                await expect(itemExists(albumPath)).resolves.toBe(true);
            }
        });

        test('getLatestAlbum() with empty album', async () => {
            const album = (await getLatestAlbum())?.album;
            if (!album) throw new Error(`No latest album`);

            const albumPathParts = getParentAndNameFromPath(albumPath);
            expect(album?.itemName).toBe(albumPathParts.name);
            expect(album?.parentPath).toBe(albumPathParts.parent);
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
            const album = await getAlbumAndChildren(albumPath);
            if (!album) throw new Error(`No album`);

            const albumPathParts = getParentAndNameFromPath(albumPath);
            expect(album.album?.itemName).toBe(albumPathParts.name);
            expect(album.album?.parentPath).toBe(albumPathParts.parent);

            if (!album.children) throw new Error('no children');
            const imagePathParts = getParentAndNameFromPath(imagePath);
            const theChild = album.children.find((child) => child.itemName === imagePathParts.name);
            if (!theChild) throw new Error(`Did not find child image`);
            expect(theChild?.parentPath).toBe(imagePathParts.parent);
        });

        test.todo('getLatestAlbum() has this image as its thumbnail');
        test.todo('retrieve sized image');
        test.todo('sized image exists in derived images bucket');
    });
});

describe('update', () => {
    test.todo('updateAlbum()');
    test.todo('updateImage()');
});

describe('delete', () => {
    test('deleteAlbum() fails when not empty', async () => {
        await expect(deleteAlbum(albumPath)).rejects.toThrow(/child/i);
    });

    describe('deleteImage()', () => {
        test('delete all images in album', async () => {
            const children = (await getAlbumAndChildren(albumPath))?.children;
            if (!children) throw new Error('no children');
            for (const child of children) {
                if (!child.parentPath) throw 'child has no parent path';
                const childPath = child.parentPath + child.itemName;
                await expect(deleteImage(childPath)).resolves.not.toThrow();
            }
        }, 15000 /* increase Jest's timeout */);

        test('album no longer contains children', async () => {
            const album = await getAlbumAndChildren(albumPath);
            if (!album) throw new Error(`No album results`);
            expect(album?.children?.length).toBe(0);
        });
    });

    test('deleteAlbum() succeeds when empty', async () => {
        await expect(deleteAlbum(albumPath)).resolves.not.toThrow();
    });
});
