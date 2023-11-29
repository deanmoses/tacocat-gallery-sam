import { isImageFormat, OptimizingParams } from './optimizeImage';

const pathImageIdPattern =
    /^\/i\/(?<ID>\d\d\d\d\/(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\/[a-zA-Z0-9_-]+\.(jpg|jpeg|gif|png))\/(?<VERSION>[^\/]+)/;

export type PathParams = OptimizingParams & {
    id?: string;
    versionId?: string;
    error?: string;
};

/**
 * Parse parameters from the URL path
 *
 * @param path like /i/2001/12-31/image.jpg/VERSIONID/webp/300x400/fp=200,100/crop=10,20,400,540
 */
export function parsePath(path: string): PathParams {
    const match = path.match(pathImageIdPattern);
    if (!match) return { error: 'missing image id or version id' };

    const id = match.groups?.ID; // named capture group ID must be the image id
    const versionId = match.groups?.VERSION; // named capture group VERSION must be the version id
    const segments = path.substring(match[0].length).split('/');

    // go through all remaining segments and try to parse them, merge the results
    return segments.reduce<PathParams>((params, segment) => ({ ...params, ...parseSegment(segment) }), {
        id,
        versionId,
    });
}

const parseSegment = (segment: string) =>
    ignoreEmptySegment(segment) ||
    parseFormat(segment) ||
    parseDimensions(segment) ||
    parseFocusPoint(segment) ||
    parseCropRectangle(segment) ||
    parseQuality(segment) ||
    parseBackground(segment) || { error: `invalid segment "${segment}"` };

const ignoreEmptySegment = (segment: string) => (!segment ? {} : undefined);

const parseFormat = (segment: string) => {
    return isImageFormat(segment) ? { format: segment } : undefined;
};

const parseDimensions = (segment: string) => {
    if (segment.match(/^\d+$/)) return { width: parseInt(segment), height: NaN };
    const match = segment.match(/^(\d+)?x(\d+)?$/);
    if (!match) return undefined;
    return { width: parseInt(match[1]), height: parseInt(match[2]) };
};

const parseFocusPoint = (segment: string) => {
    const match = segment.match(/^fp=(\d+),(\d+)$/);
    if (!match) return undefined;
    return { focus: { x: parseInt(match[1]), y: parseInt(match[2]) } };
};

const parseCropRectangle = (segment: string) => {
    const match = segment.match(/^crop=(\d+),(\d+),(\d+),(\d+)$/);
    if (!match) return undefined;
    return {
        crop: {
            x: parseInt(match[1]),
            y: parseInt(match[2]),
            width: parseInt(match[3]),
            height: parseInt(match[4]),
        },
    };
};

const parseQuality = (segment: string) => {
    const match = segment.match(/^q=(\d+)$/);
    if (!match) return undefined;
    return { quality: parseInt(match[1]) };
};

const parseBackground = (segment: string) => {
    const match = segment.match(/^bg=([0-9a-f]{6})$/);
    if (!match) return undefined;
    return { background: `#${match[1]}` };
};

const parseInt = (value: string | undefined) => Number.parseInt(value!); // parseInt(undefined) will return NaN
