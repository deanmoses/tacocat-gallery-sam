import { parseUrlPath } from './parsePath';
import { loadOriginalImage, loadVideoPoster, saveOptimizedImage } from './s3';
import { optimizeImage } from './optimizeImage';
import { hasVideoExtension } from '../../lib/gallery_path_utils/galleryPathUtils';

export type DerivedImageResult = {
    statusCode: number;
    headers: Record<string, string>;
    body?: string;
    isBase64Encoded?: boolean;
};

/**
 * Generate a derived (resized/optimized) image from an original.
 *
 * For images: loads from Originals bucket
 * For videos: loads poster from Derived bucket
 *
 * @param method HTTP method (GET or HEAD)
 * @param urlPath URL path like /i/2024/01-15/image.jpg/<versionId>/200
 */
export async function generateDerivedImage(method: string, urlPath: string): Promise<DerivedImageResult> {
    if (!['GET', 'HEAD'].includes(method)) return methodNotAllowed;

    if (urlPath.includes('favico')) return notFound;

    const { id, versionId, error, ...params } = parseUrlPath(urlPath);
    if (error) {
        console.error({ event: 'parse_error', urlPath: urlPath, error });
        return badRequest;
    }
    if (!versionId) return badRequest;
    if (!id) return notFound;

    let original: Uint8Array | undefined;
    const loadStart = performance.now();
    if (hasVideoExtension(id)) {
        // id is the S3 key (e.g., "2024/01-15/video.mp4")
        original = await loadVideoPoster(id, versionId);
    } else {
        original = await loadOriginalImage(id, versionId);
    }
    const loadMs = performance.now() - loadStart;
    if (!original) return notFound;

    const sharpStart = performance.now();
    const { buffer, format, sourceSize } = await optimizeImage(original, params);
    const sharpMs = performance.now() - sharpStart;

    const contentType = `image/${format}`;
    const headers = { 'content-type': contentType, 'cache-control': cacheControl };
    const saveStart = performance.now();
    await saveOptimizedImage(urlPath, buffer, contentType, cacheControl);
    const saveMs = performance.now() - saveStart;

    // Sharp time scales with the original, which the request never names; this
    // line is what ties the output the request asked for to the input it cost.
    console.info({
        event: 'derived_image_generated',
        path: urlPath,
        format,
        bytes: buffer.length,
        originalBytes: original.length,
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        loadMs: Math.round(loadMs),
        sharpMs: Math.round(sharpMs),
        saveMs: Math.round(saveMs),
    });

    if (method === 'HEAD') return { statusCode: 200, headers };

    const body = buffer.toString('base64');
    if (body.length > lambdaResponseLimit) {
        // A Lambda URL can't return a response this large. The 503 tells CloudFront to
        // retry, and the retry is served from S3, where the image was just saved.
        console.warn({ event: 'response_too_large', path: urlPath, bytes: buffer.length, base64Bytes: body.length });
        return retryLater;
    }
    return { statusCode: 200, headers, body, isBase64Encoded: true };
}

const lambdaResponseLimit = 5 * 1024 * 1024;

const textResponse = (statusCode: number, body: string): DerivedImageResult => ({
    statusCode,
    headers: {
        'content-type': 'text/plain',
        'cache-control': `public, max-age=${statusCode < 500 ? 300 : 60}`,
    },
    body,
    isBase64Encoded: false,
});
const cacheControl = 'public, max-age=31536000'; // 1 year
const badRequest = textResponse(400, 'bad request');
const notFound = textResponse(404, 'not found');
const methodNotAllowed = textResponse(405, 'method not allowed');
const retryLater: DerivedImageResult = {
    statusCode: 503,
    headers: { 'retry-after': '1', 'cache-control': 'no-cache, no-store' },
};
