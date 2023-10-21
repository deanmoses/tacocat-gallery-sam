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
    if (!path) throw new Error('Path cannot be empty');
    path = path.toString().trim();
    if (!path) throw new Error('Path cannot be empty');
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
