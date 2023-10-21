import { getParentAndNameFromPath } from './getParentAndNameFromPath';

/**
 * For the given path, return the leaf name
 *
 * For example:
 *  - /2001/12-31/image.jpg returns image.jpg
 *  - /2001/12-31 returns 12-31
 *  - /2001 returns 2001
 *  - / returns  ''
 *
 * @param {String} path a path of the format /2001/12-31/image.jpg, or a subset thereof
 * @returns {Object} of format {parent: STRING, name: STRING}
 */
export function getParentFromPath(path: string) {
    return getParentAndNameFromPath(path).name;
}
