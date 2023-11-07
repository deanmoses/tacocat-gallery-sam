/**
 * Determine if specified string is a valid album or image path such as / or /2001/ or /2001/12-31/ or /2001/12-31/image.jpg
 */
export function isValidPath(path: string): boolean {
    return isValidAlbumPath(path) || isValidImagePath(path);
}

/**
 * Determine if specified string is a valid album path.
 * Must be root, year or album path like / or /2001/ or /2001/12-31/
 */
export function isValidAlbumPath(path: string): boolean {
    return getAlbumPathRegex().test(path);
}

/**
 * Root, year or album path like / or /2001/ or /2001/12-31/
 */
function getAlbumPathRegex() {
    return new RegExp(getAlbumPathRegexString());
}

/**
 * Root, year or album path like / or /2001/ or /2001/12-31/
 */
function getAlbumPathRegexString() {
    return /^(\/\d\d\d\d(\/(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))?)?\/$/;
}

/**
 * Return true if specified string is a valid year album path like /2001/12-31/
 */
export function isValidYearAlbumPath(yearAlbumPath: string): boolean {
    return /^\/\d\d\d\d\/$/.test(yearAlbumPath);
}

/**
 * Return true if specified string is a valid day album name like 12-31
 */
export function isValidDayAlbumName(dayAlbumName: string): boolean {
    return /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dayAlbumName);
}

/**
 * Determine if specified string is a valid image path.
 * Cannot be an image on the root album like /image.jpg
 * or an image on a year album like /2001/image.jpg
 * Must be an image on a day album like /2001/12-31/image.jpg
 */
export function isValidImagePath(path: string): boolean {
    return getImagePathRegex().test(path);
}

function getImagePathRegex() {
    return new RegExp(getImagePathRegexString());
}
function getImagePathRegexString() {
    return /^\/\d\d\d\d\/(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\/[a-zA-Z0-9_-]+\.(jpg|jpeg|gif|png)$/i;
}

/**
 * Determine if specified string is a valid image name.
 * Must not have a path.
 *
 * @param imageName image name like 'image.jpg'
 */
export function isValidImageName(imageName: string): boolean {
    return new RegExp(getImageNameRegex()).test(imageName);
}

function getImageNameRegex() {
    return /^[a-zA-Z0-9_-]+\.(jpg|jpeg|gif|png)$/i;
}

/**
 * Determine if specified string is a valid image name, strict.
 * Must not have a path.
 *
 * @param imageName image name like 'image.jpg'
 */
export function isValidImageNameStrict(imageName: string): boolean {
    return new RegExp(getImageNameStrictRegex()).test(imageName);
}

function getImageNameStrictRegex() {
    return /^[a-z0-9]+([a-z0-9_]*[a-z0-9]+)*\.(jpg|gif|png)$/;
}

/**
 * Return a sanitized version of the specified image name.
 *  - IMAGE.JPG -> image.jpg
 *  - image-1.jpg -> image_1.jpg
 *  - image 1.jpg -> image_1.jpg
 * Does not check whether it's a valid image name for the gallery.
 *
 * @param imageName filename like some-image.jpg
 */
export function sanitizeImageName(imageName: string): string {
    return (imageName || '')
        .toLowerCase()
        .replace(/\.jpeg$/, '.jpg') // jpeg -> jpg
        .replace(/[^a-z0-9_\.]+/g, '_') // special chars to _
        .replace(/_+/g, '_') // multple underscores to _
        .replace(/^_/g, '') // remove leading underscore
        .replace(/(_)\./g, '.'); // remove trailing underscore
}
