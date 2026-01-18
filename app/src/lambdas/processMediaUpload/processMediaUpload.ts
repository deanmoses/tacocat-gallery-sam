import { isValidVideoPath, isHeicPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { processImageUpload } from './processImageUpload';
import { processVideoUpload } from './processVideoUpload';
import { processHeicUpload } from './processHeicUpload';

/**
 * Route media upload to appropriate processor based on file type.
 *
 * @param bucket name of S3 bucket
 * @param key S3 object key (without leading slash)
 * @param versionId S3 version ID
 */
export async function processMediaUpload(bucket: string, key: string, versionId: string | undefined): Promise<void> {
    const mediaPath = '/' + key;

    if (isValidVideoPath(mediaPath)) {
        await processVideoUpload(bucket, key, versionId);
    } else if (isHeicPath(key)) {
        await processHeicUpload(bucket, key);
    } else {
        await processImageUpload(bucket, key, versionId);
    }
}
