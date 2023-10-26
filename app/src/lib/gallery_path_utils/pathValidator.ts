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
 * Determine if specified string is a valid image path.
 * Cannot be an image on the root album like /image.jpg
 * or an image on a year album like /2001/image.jpg
 * Must be an image on a week album like /2001/12-31/image.jpg
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
