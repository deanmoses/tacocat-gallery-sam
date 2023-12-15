import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { fromPathToS3OriginalBucketKey } from '../../s3_utils/s3path';
import { getOriginalImagesBucketName } from '../../lambda_utils/Env';
import { getParentFromPath, isValidDayAlbumPath, isValidImagePath } from '../../gallery_path_utils/galleryPathUtils';
import { BadRequestException } from '../../lambda_utils/BadRequestException';
import { itemExists } from '../itemExists/itemExists';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Map of imagePath -> uploadUrl */
export type UploadUrlMap = { [key: string]: string };

/**
 * Generate presigned URLs for uploading images to S3
 *
 * @param albumPath Path to album to which to upload the imags
 * @param imagePaths Paths to images to upload
 */
export async function generateUploadUrls(albumPath: string, imagePaths: string[]): Promise<UploadUrlMap> {
    if (!isValidDayAlbumPath(albumPath)) throw new BadRequestException(`Invalid day album path [${albumPath}]`);
    if (!imagePaths?.length) throw new BadRequestException('No images to upload');
    for (const imagePath of imagePaths) {
        // This rejects (correctly) for any file that's not (jpg|jpeg|gif|png)
        if (!isValidImagePath(imagePath)) throw new BadRequestException(`Invalid image path [${imagePath}]`);
        if (getParentFromPath(imagePath) !== albumPath)
            throw new BadRequestException(`Image [${imagePath}] not in album [${albumPath}]`);
    }
    if (!(await itemExists(albumPath))) throw new BadRequestException(`Album does not exist: [${albumPath}]`);
    const s3Client = new S3Client({});
    const uploadUrls: UploadUrlMap = {};
    for (const imagePath of imagePaths) {
        uploadUrls[imagePath] = await generateUploadUrl(s3Client, imagePath);
    }
    return uploadUrls;
}

async function generateUploadUrl(s3Client: S3Client, imagePath: string): Promise<string> {
    return getSignedUrl(
        s3Client,
        new PutObjectCommand({
            Bucket: getOriginalImagesBucketName(),
            Key: fromPathToS3OriginalBucketKey(imagePath),
        }),
        { expiresIn: 15 * 60 /* 15 mins */ },
    );
}
