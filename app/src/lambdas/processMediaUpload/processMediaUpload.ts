import {
    isValidMediaPathForUpload,
    isValidAlbumPath,
    hasVideoExtension,
    hasHeicExtension,
    hasImageExtension,
} from '../../lib/gallery_path_utils/galleryPathUtils';
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

    if (!isValidMediaPathForUpload(mediaPath)) {
        if (isValidAlbumPath(mediaPath)) {
            console.info(JSON.stringify({ event: 's3_album_folder_created', mediaPath }));
        } else {
            console.error(JSON.stringify({ event: 's3_invalid_media_path', mediaPath }));
        }
    } else if (hasVideoExtension(mediaPath)) {
        await processVideoUpload(bucket, key, versionId);
    } else if (hasHeicExtension(mediaPath)) {
        await processHeicUpload(bucket, key);
    } else if (hasImageExtension(mediaPath)) {
        await processImageUpload(bucket, key, versionId);
    } else {
        throw new Error(`Unrecognized file extension for path: [${mediaPath}]`);
    }
}
