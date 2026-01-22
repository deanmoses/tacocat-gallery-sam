import { isValidMediaPath, isValidPath, isValidPathForUpload } from '../gallery_path_utils/galleryPathUtils';

/**
 * Given a gallery album or image path like /2001/12-31/ or /2001/12-31/image.jpg,
 * return that item's key in the S3 original images bucket
 */
export function fromPathToS3OriginalBucketKey(path: string): string {
    if (!isValidPath(path)) throw new Error(`Invalid path: [${path}]`);
    return path.substring(1); // remove the starting '/' from path
}

/**
 * Like {@link fromPathToS3OriginalBucketKey} but also accepts HEIC/HEIF image paths.
 */
export function fromPathToS3OriginalBucketKeyForUpload(path: string): string {
    if (!isValidPathForUpload(path)) throw new Error(`Invalid path: [${path}]`);
    return path.substring(1);
}

/**
 * Given a gallery album or image key in S3 originals bucket like 2001/12-31/ or 2001/12-31/image.jpg
 * (note missing leading slash), return that item's regular gallery path
 */
export function fromS3OriginalBucketKeyToPath(key: string): string {
    return '/' + key;
}

//
// Derived asset paths in the Derived bucket
// Structure: i/<path>/<versionId>/<asset>
// For images: i/<path>/<versionId>/200, i/<path>/<versionId>/400, etc.
// For videos: i/<path>/<versionId>/video-transcoded, i/<path>/<versionId>/video-poster
//

/**
 * Get the S3 key prefix for a media items's derived assets: i/<path>/
 *
 * @param path A album OR media path (e.g., /2024/01-15/ or /2024/01-15/video.mp4)
 */
export function getDerivedAssetPrefix(path: string): string {
    if (!isValidPath(path)) throw new Error(`Invalid path: [${path}]`);
    return 'i' + path; // all images are under the '/i/' "folder"
}

/**
 * Get the S3 key prefix for a media item's derived assets: i/<path>/<versionId>/
 *
 * @param path The gallery path (e.g., /2024/01-15/image.jpg or /2024/01-15/video.mp4)
 * @param versionId The S3 version ID of the original media
 */
export function getDerivedAssetVersionPrefix(path: string, versionId: string): string {
    if (!isValidMediaPath(path)) throw new Error(`Invalid media path: [${path}]`);
    if (!versionId) throw new Error(`Invalid versionId: [${versionId}]`);
    return getDerivedAssetPrefix(path) + `/${versionId}/`;
}

/**
 * Get the S3 key for a transcoded video: i/<path>/<versionId>/video-transcoded
 *
 * @param path The gallery path of the video (e.g., /2024/01-15/video.mp4)
 * @param versionId The S3 version ID of the original video
 */
export function getTranscodedVideoS3Key(path: string, versionId: string): string {
    return getDerivedAssetVersionPrefix(path, versionId) + 'video-transcoded';
}

/**
 * Get the S3 key for a video poster: i/<path>/<versionId>/video-poster
 *
 * @param path The gallery path of the video (e.g., /2024/01-15/video.mp4)
 * @param versionId The S3 version ID of the original video
 */
export function getVideoPosterS3Key(path: string, versionId: string): string {
    return getDerivedAssetVersionPrefix(path, versionId) + 'video-poster';
}
