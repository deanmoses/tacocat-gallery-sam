import { parseUrlPath } from './parsePath';
import { loadOriginalImage, loadVideoPoster, saveOptimizedImage } from './s3';
import { getVideoUuid } from './ddb';
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
 * For videos: looks up UUID from DynamoDB, then loads poster from Derived bucket
 *
 * @param method HTTP method (GET or HEAD)
 * @param urlPath URL path like /i/2024/01-15/image.jpg/<versionId>/200
 */
export async function generateDerivedImage(method: string, urlPath: string): Promise<DerivedImageResult> {
    if (!['GET', 'HEAD'].includes(method)) return methodNotAllowed;

    if (urlPath.includes('favico')) return notFound;

    const { id, versionId, error, ...params } = parseUrlPath(urlPath);
    if (error) {
        console.error(JSON.stringify({ event: 'parse_error', urlPath: urlPath, error }));
        return badRequest;
    }
    if (!versionId) return badRequest;
    if (!id) return notFound;

    let original: Uint8Array | undefined;
    if (hasVideoExtension(id)) {
        const uuid = await getVideoUuid(id);
        if (!uuid) {
            console.error(JSON.stringify({ event: 'video_uuid_not_found', id }));
            return notFound;
        }
        original = await loadVideoPoster(uuid, versionId);
    } else {
        original = await loadOriginalImage(id, versionId);
    }
    if (!original) return notFound;

    const { buffer, format } = await optimizeImage(original, params);

    const contentType = `image/${format}`;
    const headers = { 'content-type': contentType, 'cache-control': cacheControl };
    await saveOptimizedImage(urlPath, buffer, contentType, cacheControl);

    if (method === 'HEAD') return { statusCode: 200, headers };

    const body = buffer.toString('base64');
    if (body.length > 5 * 1024 * 1024) return retryLater; // can't return large response via lambda, subsequent requests will be served from S3
    return { statusCode: 200, headers, body, isBase64Encoded: true };
}

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
