/**
 * Determine if specified string is a valid album or image path
 * such as / or /2001/ or /2001/12-31/ or /2001/12-31/image.jpg
 */
export function isValidPath(path: string): boolean {
    return isValidAlbumPath(path) || isValidImagePath(path);
}

/**
 * Determine if specified string is a valid album path.
 * Must be root, year or album path like / or /2001/ or /2001/12-31/
 */
export function isValidAlbumPath(path: string): boolean {
    return /^(\/\d\d\d\d(\/(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))?)?\/$/.test(path);
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
    return /^\/\d\d\d\d\/(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\/[a-zA-Z0-9_-]+\.(jpg|jpeg|gif|png)$/i.test(path);
}

/**
 * Determine if specified string is a valid image name.
 * Must not have a path.
 *
 * @param imageName image name like 'image.jpg'
 */
export function isValidImageName(imageName: string): boolean {
    return /^[a-zA-Z0-9_-]+\.(jpg|jpeg|gif|png)$/i.test(imageName);
}

/**
 * Determine if specified string is a valid image name, strict.
 * Must not have a path.
 *
 * @param imageName image name like 'image.jpg'
 */
export function isValidImageNameStrict(imageName: string): boolean {
    return /^[a-z0-9]+([a-z0-9_]*[a-z0-9]+)*\.(jpg|gif|png)$/.test(imageName);
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

/**
 * For the given path, return 1) the leaf item and 2) the parent path
 *
 * For example:
 *  - /2001/12-31/image.jpg returns  '/2001/12-31/' and 'image.jpg'
 *  - /2001/12-31 returns '/2001/' and '12-31'
 *  - /2001 returns '/' and 2000'
 *  - / returns  ''
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
    if (path.substr(-1) !== '/') path = path + '/'; // make sure path ends with a "/"
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
