/**
 * Return whether the specified path is a valid album path.
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
    return /^(\/\d\d\d\d(\/(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01]))?)?\/$/;
}
