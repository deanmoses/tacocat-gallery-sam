import {
    getNameFromPath,
    isValidAlbumPath,
    isValidImagePath,
    isValidYearAlbumPath,
} from '../../../lib/gallery_path_utils/galleryPathUtils';

/**
 * Get path of an album for today's date
 *
 * @returns an album path like /2030/01-31/
 */
export function getAlbumPathForToday(): string {
    const day = new Date().getDate().toString().padStart(2, '0');
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const year = new Date().getFullYear();
    const albumName = `${month}-${day}`;
    return `/${year}/${albumName}/`;
}

/**
 * Get path to a unique image for today's date
 *
 * @returns an image path like /2030/01-31/image-982374923.jpg
 */
export function getUniqueImagePathForToday(imageNamePrefix: string = 'image-'): string {
    const newImageName = `${imageNamePrefix}${Date.now()}.jpg`;
    return getAlbumPathForToday() + newImageName;
}

/**
 * Same as getNameFromPath(), but throws error if there's no name.
 * Useful so that tests don't have to always be testing for the existence of the path.
 *
 * @param path album or image path of the format /2001/12-31/image.jpg, or a subset thereof
 * @returns leaf name
 */
export function reallyGetNameFromPath(path: string): string {
    const name = getNameFromPath(path);
    if (!name) throw new Error(`There was no leaf name in path [${path}]`);
    return name;
}

export function assertIsValidImagePath(imagePath: string): void {
    if (!isValidImagePath(imagePath)) throw new Error(`Invalid image path: [${imagePath}]`);
}

export function assertIsValidAlbumPath(albumPath: string): void {
    if (!isValidAlbumPath(albumPath)) throw new Error(`Invalid album path: [${albumPath}]`);
}

export function assertIsValidYearAlbumPath(albumPath: string): void {
    if (!isValidYearAlbumPath(albumPath)) throw new Error(`Invalid year album path: [${albumPath}]`);
}
