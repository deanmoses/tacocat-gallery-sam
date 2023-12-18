import sharp, { Metadata, Region } from 'sharp';
import { focusCrop, Point, Rectangle, Size } from './focusCrop';
import { getJpegQuality } from '../../lib/lambda_utils/Env';

export const imageFormats = ['webp', 'jpeg', 'avif', 'gif'] as const;
export type ImageFormat = (typeof imageFormats)[number];
export const isImageFormat = (value: unknown): value is ImageFormat => imageFormats.includes(value as ImageFormat);

type TransformParams = {
    format: ImageFormat;
    width?: number;
    height?: number;
    focus?: Point;
    crop?: Rectangle;
    quality?: number;
    /** Background color to blend alpha channel with */
    background?: string;
    /** Preserve animation (defaults to false) */
    animated?: boolean;
};

export type OptimizingParams = Partial<TransformParams>;

export const optimizeImage = async (image: Uint8Array, params: OptimizingParams) => {
    if (params.format) return transformImage(image, params as TransformParams);

    const meta = await sharp(image).metadata();

    // Always return jpegs as jpegs
    if (['jpeg'].includes(meta.format ?? '')) {
        return await transformImage(image, { ...params, format: 'jpeg' });
    }

    // Always return gifs as gifs
    if (['gif'].includes(meta.format ?? '')) {
        // to avoid animated thumbnails, only animate if new size is larger than 200px
        const animated = (!!params.width && params.width > 200) || (!!params.height && params.height > 200);
        return await transformImage(image, { ...params, format: 'gif', animated });
    }

    // For source images with format `png` or an alpha channel always
    // prefer webp for better image quality
    if (meta.hasAlpha || ['png', 'gif', 'webp', 'tif', 'tiff'].includes(meta.format ?? '')) {
        return await transformImage(image, { ...params, format: 'webp' });
    }

    // The compression between webp and jpeg (mozjpg) is very similiar.
    // actually, for photos with lots of details mozjpg produces smaller images
    // and for low detail images (screenshots, diagrams, ...) webp produces smaller ones.
    // Because jpeg and webp are supported by all modern browsers, we can
    // pick the format that has the best compression, if no format was specified.
    const results = await Promise.all([
        transformImage(image, { ...params, format: 'webp' }),
        transformImage(image, { ...params, format: 'jpeg' }),
    ]);
    return results[0].buffer.length < results[1].buffer.length ? results[0] : results[1];
};

const transformImage = async (image: Uint8Array, params: TransformParams) => {
    const animated = params.animated ?? false;
    const sharpImage = sharp(image, { animated });
    const meta = await sharpImage.metadata();
    const size = getImageSize(meta);
    const {
        width = params.height ? 0 : 320,
        height = params.width ? 0 : 200,
        focus = defaultFocus(size),
        crop = defaultCrop(size),
        background = params.format === 'jpeg' ? '#ffffff' : params.background, // for jpeg we need to always flatten
        format,
    } = params;

    const ratio = width && height ? width / height : crop.width / crop.height;
    const source = limitedRegion(focusCrop(ratio, focus, crop), size);
    const finalSize = limitedSize(width, height, ratio, source);
    const quality = params.quality || getQuality(format, finalSize);

    if (background) {
        sharpImage.flatten({ background });
    }
    sharpImage.rotate(); // normalize rotation
    sharpImage.extract(source);
    sharpImage.resize(finalSize);
    sharpImage.withExif({ IFD0: { Copyright: `Copyright Dean and Lucie Moses. All rights reserved` } });
    sharpImage[format]({ quality, mozjpeg: true }); // convert image format
    return { buffer: await sharpImage.toBuffer(), format };
};

export const getQuality = (format: ImageFormat, size: Size): number => {
    const pixels = size.width * size.height;
    if (format === 'jpeg' || format === 'webp') {
        return getJpegQuality();
    } else if (format === 'avif') {
        if (pixels < 400 * 400) return 55;
        if (pixels < 800 * 800) return 45;
        return 35;
    } else if (format === 'gif') {
        return 95;
    }
    throw Error(`automatic quality for format ${format} not implemented`);
};

export const getImageSize = ({ width, height, pageHeight, orientation }: Metadata) => {
    if (!width || !height) throw Error('original image has no size');
    if (!!pageHeight) height = pageHeight; // animated gif, use pageHeight instead of height because height is all frames combined
    // if present, orientation is 1 2 3 4 5 6 7 8 and describes rotation and mirroring, see https://exiftool.org/TagNames/EXIF.html
    return orientation && orientation > 4 && orientation <= 8
        ? { width: height, height: width } // rotate 90 degrees for orientation 5, 6, 7 and 8
        : { width, height }; // do nothing for all other values, including undefined, NaN, ...
};

const defaultFocus = (size: Size) => ({
    x: size.width / 2,
    y: size.height / 3,
});

const defaultCrop = (size: Size) => ({
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
});

// calculate a region from a Rectangle that lies inside the original image (round to pixels)
export const limitedRegion = (rect: Rectangle, max: Size): Region => {
    const left = Math.max(0, Math.round(rect.x));
    const top = Math.max(0, Math.round(rect.y));
    return {
        left,
        top,
        width: Math.min(max.width - left, Math.round(rect.width)),
        height: Math.min(max.height - top, Math.round(rect.height)),
    };
};

// calculate width and height so that the resulting region is fits into the source region
// because we don't want to artificially create images larger than the original
const limitedSize = (width: number, height: number, ratio: number, source: Size): Size => {
    if (!width) width = height * ratio;
    if (!height) height = width / ratio;
    if (width > source.width) {
        width = source.width;
        height = source.width / ratio;
    }
    if (height > source.height) {
        width = source.height * ratio;
        height = width / ratio;
    }
    return {
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
    };
};
