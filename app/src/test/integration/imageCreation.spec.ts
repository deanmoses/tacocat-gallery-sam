import { createAlbum } from '../../lib/gallery/createAlbum/createAlbum';
import { deleteAlbum } from '../../lib/gallery/deleteAlbum/deleteAlbum';
import { deleteImage } from '../../lib/gallery/deleteImage/deleteImage';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbumAndChildren';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { getNameFromPath } from '../../lib/gallery_path_utils/getNameFromPath';
import { getParentAndNameFromPath } from '../../lib/gallery_path_utils/getParentAndNameFromPath';
import { uploadImage } from './helpers/s3ImageHelper';

// I'm hoping these paths are unique to these tests,
// to help prevent polluting state between tests
const albumPath = '/1951/09-02/';
const imagePath = '/1951/09-02/image.jpg';

test('create album', async () => {
    if (!(await itemExists(albumPath))) {
        await expect(createAlbum(albumPath, false /* don't error if already exists*/)).resolves.not.toThrow();
    }
});

test('upload image', async () => {
    const newImageName = getNameFromPath(imagePath);
    if (!newImageName) throw new Error('newImageName is undefined');
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

test.todo('retrieve sized image');
test.todo('sized image exists in derived images bucket');

test('delete all images in album', async () => {
    const children = (await getAlbumAndChildren(albumPath))?.children;
    if (!children) throw new Error('no children');
    for (const child of children) {
        if (!child.parentPath) throw 'child has no parent path';
        const childPath = child.parentPath + child.itemName;
        await expect(deleteImage(childPath)).resolves.not.toThrow();
    }
}, 15000 /* increase Jest's timeout */);

test('delete album', async () => {
    await expect(deleteAlbum(albumPath)).resolves.not.toThrow();
});
