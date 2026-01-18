import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fromPathToS3OriginalBucketKeyForUpload } from '../../s3_utils/s3path';
import { getOriginalImagesBucketName } from '../../lambda_utils/Env';
import {
    getParentFromPathForUpload,
    isValidDayAlbumPath,
    isValidMediaPathForUpload,
} from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { itemExists } from '../itemExists/itemExists';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Presigned URL expiration in seconds */
const UPLOAD_URL_EXPIRATION_SECONDS = 60 * 60; // 1 hour is enough large video uploads

/** Map of mediaPath -> uploadUrl */
export type UploadUrlMap = { [key: string]: string };

/**
 * Generate presigned URLs for uploading media (images or videos) to S3
 *
 * @param albumPath Path to album to which to upload the media
 * @param mediaPaths Paths to media files to upload
 */
export async function generateUploadUrls(albumPath: string, mediaPaths: string[]): Promise<UploadUrlMap> {
    if (!isValidDayAlbumPath(albumPath)) throw new BadRequestException(`Invalid day album path [${albumPath}]`);
    if (!mediaPaths?.length) throw new BadRequestException('No media to upload');
    for (const mediaPath of mediaPaths) {
        if (!isValidMediaPathForUpload(mediaPath)) throw new BadRequestException(`Invalid media path [${mediaPath}]`);
        if (getParentFromPathForUpload(mediaPath) !== albumPath)
            throw new BadRequestException(`Media [${mediaPath}] not in album [${albumPath}]`);
    }
    if (!(await itemExists(albumPath))) throw new BadRequestException(`Album does not exist: [${albumPath}]`);
    const s3Client = new S3Client({});
    const uploadUrls: UploadUrlMap = {};
    for (const mediaPath of mediaPaths) {
        uploadUrls[mediaPath] = await generateUploadUrl(s3Client, mediaPath);
    }
    return uploadUrls;
}

async function generateUploadUrl(s3Client: S3Client, mediaPath: string): Promise<string> {
    return getSignedUrl(
        s3Client,
        new PutObjectCommand({
            Bucket: getOriginalImagesBucketName(),
            Key: fromPathToS3OriginalBucketKeyForUpload(mediaPath),
        }),
        { expiresIn: UPLOAD_URL_EXPIRATION_SECONDS },
    );
}
