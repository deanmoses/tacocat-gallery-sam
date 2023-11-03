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
 * @param path a path of the format /2001/12-31/image.jpg, or a subset thereof
 * @returns name of leaf, like image.jpg
 */
export function getNameFromPath(path: string): string | undefined {
    return getParentAndNameFromPath(path).name;
}
