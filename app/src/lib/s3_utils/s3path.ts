import { isValidPath, isValidPathForUpload } from '../gallery_path_utils/galleryPathUtils';

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

export function fromPathToS3DerivedImagesBucketKey(path: string): string {
    if (!isValidPath(path)) throw new Error(`Invalid path: [${path}]`);
    return 'i' + path; // all images are under the '/i/' "folder"
}

//
// Derived asset paths in the Derived bucket, keyed by the DynamoDB ID of the gallery item
// Structure: d/<id>/<versionId>/<type>/...
// Currently only used for video assets, but designed to support future media types
//

/**
 * Get the S3 key prefix for all versions of a media item's derived assets: d/<id>/
 *
 * @param id The DynamoDB ID of the gallery item
 */
export function getDerivedAssetIdPrefix(id: string): string {
    return `d/${id}/`;
}

/**
 * Get the S3 key prefix for a specific version of a media item's derived assets: d/<id>/<versionId>/
 *
 * @param id The DynamoDB ID of the gallery item
 * @param versionId The S3 version ID of the gallery item's original media file
 */
export function getDerivedAssetIdVersionPrefix(id: string, versionId: string): string {
    return `d/${id}/${versionId}/`;
}

/**
 * Get the S3 key for a transcoded video: d/<id>/<versionId>/video/transcoded
 *
 * @param id The DynamoDB ID of the video
 * @param versionId The S3 version ID of the original video
 */
export function getTranscodedVideoS3Key(id: string, versionId: string): string {
    return `d/${id}/${versionId}/video/transcoded`;
}

/**
 * Get the S3 key for a video poster: d/<id>/<versionId>/video/poster
 *
 * @param id The DynamoDB ID of the video
 * @param versionId The S3 version ID of the original video
 */
export function getVideoPosterS3Key(id: string, versionId: string): string {
    return `d/${id}/${versionId}/video/poster`;
}
