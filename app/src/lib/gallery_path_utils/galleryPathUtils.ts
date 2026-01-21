import { BaseGalleryRecord } from '../gallery/galleryTypes';

/**
 * Return true if specified string is a valid album or media path
 * like / or /2001/ or /2001/12-31/ or /2001/12-31/image.jpg or /2001/12-31/video.mp4
 */
export function isValidPath(path: string): boolean {
    return isValidAlbumPath(path) || isValidMediaPath(path);
}

/**
 * Return true if specified string is a valid album or media path for upload.
 * Like {@link isValidPath} but also accepts HEIC/HEIF image paths and video paths.
 */
export function isValidPathForUpload(path: string): boolean {
    return isValidAlbumPath(path) || isValidMediaPathForUpload(path);
}

/**
 * Return true if specified string is a valid album path
 * like / or /2001/ or /2001/12-31/
 */
export function isValidAlbumPath(path: string): boolean {
    return /^(\/\d\d\d\d(\/(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))?)?\/$/.test(path);
}

/**
 * Return true if specified string is a valid year album path like /2001/
 */
export function isValidYearAlbumPath(yearAlbumPath: string): boolean {
    return /^\/\d\d\d\d\/$/.test(yearAlbumPath);
}

/**
 * Return true if specified string is a valid day album path like /2001/12-31/
 */
export function isValidDayAlbumPath(dayAlbumPath: string): boolean {
    return /^\/\d\d\d\d\/(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\/$/i.test(dayAlbumPath);
}

/**
 * Return true if specified string is a valid day album name like 12-31
 */
export function isValidDayAlbumName(dayAlbumName: string): boolean {
    return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dayAlbumName);
}

/**
 * Return true if specified string is a valid image path like /2001/12-31/image.jpg
 * Cannot be on root album like /image.jpg
 * Cannot be on year album like /2001/image.jpg
 * Must be on a day album like /2001/12-31/image.jpg
 *
 * Only accepts formats that are stored in the gallery (jpg/jpeg/gif/png).
 * For uploads that may include HEIC, use isValidImagePathForUpload().
 */
export function isValidImagePath(imagePath: string): boolean {
    return /^\/\d\d\d\d\/(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\/[a-zA-Z0-9_-]+\.(jpg|jpeg|gif|png)$/i.test(imagePath);
}

/**
 * Return true if specified string is a valid image path for upload.
 * Accepts all formats from isValidImagePath() plus HEIC/HEIF.
 * HEIC files are converted to JPEG after upload.
 */
export function isValidImagePathForUpload(imagePath: string): boolean {
    return /^\/\d\d\d\d\/(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\/[a-zA-Z0-9_-]+\.(jpg|jpeg|gif|png|heic|heif)$/i.test(
        imagePath,
    );
}

/**
 * Return true if the string has a HEIC/HEIF extension (case-insensitive).
 * There must be at least one character before the "." before the extension.
 */
export function hasHeicExtension(path: string): boolean {
    return /.\.(heic|heif)$/i.test(path);
}

/**
 * Return true if the string has a video extension (case-insensitive).
 * There must be at least one character before the "." before the extension.
 */
export function hasVideoExtension(path: string): boolean {
    return /.\.(mp4|mov|avi|mkv|webm|m4v|3gp|mpg|mpeg)$/i.test(path);
}

/**
 * Return true if the string has an image extension (case-insensitive).
 * Only accepts stored formats (jpg/jpeg/gif/png), not HEIC.
 * There must be at least one character before the "." before the extension.
 */
export function hasImageExtension(path: string): boolean {
    return /.\.(jpg|jpeg|gif|png)$/i.test(path);
}

/**
 * Return true if specified string is a valid video path like /2001/12-31/video.mp4
 * Cannot be on root album like /video.mp4
 * Cannot be on year album like /2001/video.mp4
 * Must be on a day album like /2001/12-31/video.mp4
 *
 * Supported video extensions: mp4, mov, avi, mkv, webm, m4v, 3gp, mpg, mpeg
 */
export function isValidVideoPath(videoPath: string): boolean {
    return /^\/\d\d\d\d\/(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\/[a-zA-Z0-9_-]+\.(mp4|mov|avi|mkv|webm|m4v|3gp|mpg|mpeg)$/i.test(
        videoPath,
    );
}

/**
 * Return true if specified string is a valid video name like 'video.mp4'
 * Must not have a path.
 *
 * Supported video extensions: mp4, mov, avi, mkv, webm, m4v, 3gp, mpg, mpeg
 *
 * @param videoName name of video
 */
export function isValidVideoName(videoName: string): boolean {
    return /^[a-zA-Z0-9_-]+\.(mp4|mov|avi|mkv|webm|m4v|3gp|mpg|mpeg)$/i.test(videoName);
}

/**
 * Return true if specified string is a valid strict video name.
 * Must be lower case
 * No hyphens (-) just underscores (_)
 * Must not have a path.
 *
 * @param videoName name of video
 */
export function isValidVideoNameStrict(videoName: string): boolean {
    return /^[a-z0-9]+([a-z0-9_]*[a-z0-9]+)*\.(mp4|mov|avi|mkv|webm|m4v|3gp|mpg|mpeg)$/.test(videoName);
}

/**
 * Return true if specified string is a valid media path (image or video).
 * Like /2001/12-31/image.jpg or /2001/12-31/video.mp4
 *
 * Only accepts formats that are stored in the gallery.
 * For uploads that may include HEIC, use isValidMediaPathForUpload().
 */
export function isValidMediaPath(mediaPath: string): boolean {
    return isValidImagePath(mediaPath) || isValidVideoPath(mediaPath);
}

/**
 * Return true if specified string is a valid media path for upload.
 * Accepts all formats from isValidMediaPath() plus HEIC/HEIF.
 * HEIC files are converted to JPEG after upload.
 */
export function isValidMediaPathForUpload(mediaPath: string): boolean {
    return isValidImagePathForUpload(mediaPath) || isValidVideoPath(mediaPath);
}

/**
 * Return true if specified string is a valid image name like 'image.jpg'
 * Must not have a path.
 *
 * @param imageName name of image
 */
export function isValidImageName(imageName: string): boolean {
    return /^[a-zA-Z0-9_-]+\.(jpg|jpeg|gif|png)$/i.test(imageName);
}

/**
 * Return true if specified string is a valid strict image name.
 * Must be lower case
 * No hyphens (-) just underscores (_)
 * Must be 'jpg' not 'jpeg'
 * Must not have a path.
 *
 * @param imageName name of image
 */
export function isValidImageNameStrict(imageName: string): boolean {
    return /^[a-z0-9]+([a-z0-9_]*[a-z0-9]+)*\.(jpg|gif|png)$/.test(imageName);
}

/**
 * Return true if specified string is a valid strict media name (image or video).
 * Must be lower case
 * No hyphens (-) just underscores (_)
 * Must be 'jpg' not 'jpeg' for images
 * Must not have a path.
 *
 * @param mediaName name of media
 */
export function isValidMediaNameStrict(mediaName: string): boolean {
    return isValidImageNameStrict(mediaName) || isValidVideoNameStrict(mediaName);
}

/**
 * Return the specified path's parent path and leaf item
 *  - /2001/12-31/image.jpg returns  '/2001/12-31/' and 'image.jpg'
 *  - /2001/12-31 returns '/2001/' and '12-31'
 *  - /2001 returns '/' and 2000'
 *  - / returns  '' and undefined
 *
 *  @param {String} path a path of the format /2001/12-31/image.jpg, or a subset thereof
 */
export function getParentAndNameFromPath(path: string) {
    if (!path) throw new Error('Invalid path: cannot be empty');
    path = path.toString().trim();
    if (!path) throw new Error('Invalid path: cannot be empty');
    if (!isValidPath(path)) throw new Error(`Invalid path: [${path}]`);
    if (path === '/') return { parent: '', name: '' };
    const pathParts = path.split('/'); // split the path apart
    if (!pathParts[pathParts.length - 1]) pathParts.pop(); // if the path ended in a "/", remove the blank path part at the end
    const name = pathParts.pop(); // remove leaf of path
    path = pathParts.join('/');
    if (!path.endsWith('/')) path = path + '/'; // make sure path ends with a "/"
    if (path.lastIndexOf('/', 0) !== 0) path = '/' + path; // make sure path starts with a "/"
    return {
        parent: path,
        name: name,
    };
}

/**
 * For the given path, return the parent path
 *
 * For example:
 *  - /2001/12-31/image.jpg returns  /2001/12-31/
 *  - /2001/12-31 returns /2001/
 *  - /2001 returns /
 *  - / returns  '' TODO: MAYBE THIS SHOULD BE UNDEFINED
 *
 * @param {String} path a path of the format /2001/12-31/image.jpg, or a subset thereof
 * @returns {String} parent path
 */
export function getParentFromPath(path: string): string {
    return getParentAndNameFromPath(path).parent;
}

/**
 * Like {@link getParentFromPath} but also accepts HEIC/HEIF image paths.
 */
export function getParentFromPathForUpload(path: string): string {
    if (!path) throw new Error('Invalid path: cannot be empty');
    path = path.toString().trim();
    if (!path) throw new Error('Invalid path: cannot be empty');
    if (!isValidPathForUpload(path)) throw new Error(`Invalid path: [${path}]`);
    if (path === '/') return '';
    const pathParts = path.split('/');
    if (!pathParts[pathParts.length - 1]) pathParts.pop();
    pathParts.pop();
    path = pathParts.join('/');
    if (!path.endsWith('/')) path = path + '/';
    if (path.lastIndexOf('/', 0) !== 0) path = '/' + path;
    return path;
}

/**
 * For the given path, return the leaf name
 *
 * For example:
 *  - /2001/12-31/image.jpg returns image.jpg
 *  - /2001/12-31 returns 12-31
 *  - /2001 returns 2001
 *  - / returns  ''
 *
 * @param path a path of the format /2001/12-31/image.jpg, or a subset thereof
 * @returns name of leaf, like image.jpg
 */
export function getNameFromPath(path: string): string | undefined {
    return getParentAndNameFromPath(path).name;
}

/**
 * Convert from an album path to a date.
 *
 * @param albumPath path of root, year or day album like / or /2001/ or /2001/12-31/
 */
export function albumPathToDate(albumPath: string): Date {
    if (!isValidAlbumPath(albumPath)) throw new Error(`Invalid album path: [${albumPath}]`);
    if (albumPath === '/') {
        return new Date(1826, 0, 1); // Date of first surviving photograph
    }
    const m = /^\/(?<year>\d\d\d\d)\/((?<month>\d\d)-(?<day>\d\d)\/)?$/i.exec(albumPath);
    if (!m?.groups?.year) throw new Error(`Error matching`);
    const year = Number.parseInt(m.groups.year, 10);
    if (!!m?.groups?.month && !!m?.groups?.day) {
        const month = Number.parseInt(m.groups.month, 10) - 1;
        const day = Number.parseInt(m.groups.day, 10);
        return new Date(year, month, day);
    }
    return new Date(year, 0, 1); // Use Jan 1 for year albums
}

/**
 * Convert from any path to a date.
 * @param path album, image, or video path
 */
export function pathToDate(path: string): Date {
    if (isValidAlbumPath(path)) return albumPathToDate(path);
    if (isValidMediaPath(path)) return albumPathToDate(getParentFromPath(path));
    throw new Error(`Invalid path: [${path}]`);
}

export function toPathFromItem(item: BaseGalleryRecord): string {
    switch (item?.itemType) {
        case 'album':
            return toAlbumPath(item.parentPath, item.itemName);
        case 'image':
            return toMediaPath(item.parentPath, item.itemName);
        default:
            throw new Error(`Unrecognized item type: [${item?.itemType}]`);
    }
}

export function toAlbumPath(parentPath: string | undefined, itemName: string | undefined): string {
    if (itemName === '/') return '/';
    if (!parentPath) throw new Error(`Undefined parentPath`);
    if (!itemName) throw new Error(`Undefined itemName`);
    return parentPath + itemName + '/';
}

export function toMediaPath(parentPath: string | undefined, itemName: string | undefined): string {
    if (!parentPath) throw new Error(`Undefined parentPath`);
    if (!itemName) throw new Error(`Undefined itemName`);
    return parentPath + itemName;
}
