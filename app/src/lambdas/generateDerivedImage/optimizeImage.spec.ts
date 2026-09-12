import sharpLib from 'sharp';
import type sharp from 'sharp';
import { readFileSync } from 'fs';
import path from 'path';
import { getImageSize, limitedRegion, optimizeImage, type ImageFormat } from './optimizeImage';

describe('getImageSize', () => {
    it.each([undefined, 1, 2, 3, 4])('should return normal image size for orientation % p', (orientation) => {
        const size = getImageSize({ width: 400, height: 300, orientation } as sharp.Metadata);
        expect(size).toEqual({ width: 400, height: 300 });
    });
    it.each([5, 6, 7, 8])('should return rotated image size for orientation %p', (orientation) => {
        const size = getImageSize({ width: 400, height: 300, orientation } as sharp.Metadata);
        expect(size).toEqual({ width: 300, height: 400 });
    });
});

describe('limitedRegion', () => {
    it('should limit a region to fit into the given image size (real life example)', () => {
        const region = limitedRegion(
            { x: 0, y: 1012.5, width: 5400, height: 3037.5 }, // not fractional height that can lead to rounding errors
            { width: 5400, height: 4050 },
        );
        expect(region).toEqual({ left: 0, top: 1013, width: 5400, height: 3037 });
    });
    it(`should limit a region to fit into the given image size`, () => {
        const region = limitedRegion(
            { x: -1, y: -1, width: 102, height: 202 }, // not fractional height that can lead to rounding errors
            { width: 100, height: 200 },
        );
        expect(region).toEqual({ left: 0, top: 0, width: 100, height: 200 });
    });
});

const readFixture = (fileName: string) => readFileSync(path.resolve(__dirname, '../..', 'test/data/images', fileName));

describe('optimizeImage', () => {
    // Both fixtures are camera originals carrying an EXIF IFD1 thumbnail, which must not be
    // copied into the derived image: it dwarfs the derived image's own pixels.
    const fixturesWithEmbeddedThumbnail = ['FullMetadata.jpg', 'orientation/PortraitOrientation6.jpg'];
    const formats: ImageFormat[] = ['jpeg', 'webp'];

    const derive = async (fileName: string, format: ImageFormat) => {
        const source = readFixture(fileName);
        const { buffer } = await optimizeImage(source, { width: 200, height: 200, format });
        return await sharpLib(buffer).metadata();
    };

    describe.each(formats)('%s', (format) => {
        it.each(fixturesWithEmbeddedThumbnail)('should carry over no metadata from %p', async (fileName) => {
            const { exif } = await derive(fileName, format);
            expect(exif).toBeUndefined();
        });
    });
});

describe('optimizeImage animation', () => {
    /** An animated GIF with deliberately irregular frame delays and a finite loop count. */
    const makeAnimatedGif = async () => {
        const [width, height, frames] = [300, 300, 4];
        const pixels = Buffer.alloc(width * height * frames * 3);
        for (let frame = 0; frame < frames; frame++) {
            for (let i = 0; i < width * height; i++) {
                const at = (frame * width * height + i) * 3;
                pixels[at] = frame * 60;
                pixels[at + 1] = 255 - frame * 50;
                pixels[at + 2] = (i * 7) & 0xff;
            }
        }
        return await sharpLib(pixels, {
            raw: { width, height: height * frames, channels: 3, pageHeight: height },
            animated: true,
        })
            .gif({ delay: [40, 250, 60, 500], loop: 3 })
            .toBuffer();
    };

    it('should preserve frame delays and loop count', async () => {
        const { buffer, format } = await optimizeImage(await makeAnimatedGif(), { width: 300 });
        const { pages, delay, loop } = await sharpLib(buffer, { animated: true }).metadata();
        expect(format).toBe('webp');
        expect(pages).toBe(4);
        expect(delay).toEqual([40, 250, 60, 500]);
        expect(loop).toBe(3);
    });
});
