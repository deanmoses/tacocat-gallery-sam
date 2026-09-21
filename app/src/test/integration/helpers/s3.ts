import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { GetObjectCommand, HeadObjectCommand, NotFound, PutObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime';
import { isValidMediaPathForUpload } from '../../../lib/gallery_path_utils/galleryPathUtils';
import { getDerivedImagesBucketName, getOriginalImagesBucketName } from '../../../lib/lambda_utils/Env';
import { s3Client } from '../../../lib/s3_utils/s3Client';
import { fromPathToS3OriginalBucketKeyForUpload } from '../../../lib/s3_utils/s3path';
import { waitFor } from './waitFor';

const dataDir = path.resolve(__dirname, '..', '..', 'data');

/**
 * Upload a file from the test data folder to the originals bucket, which
 * triggers the upload-processing Lambda.
 *
 * @param fixture file relative to the test data folder, like images/image.jpg
 * @param mediaPath gallery path to upload it to, like /2001/12-31/image.jpg
 * @returns the S3 version ID of the upload
 */
export async function uploadMedia(fixture: string, mediaPath: string): Promise<string> {
    if (!isValidMediaPathForUpload(mediaPath)) throw new Error(`Invalid media path for upload: [${mediaPath}]`);
    const filePath = path.join(dataDir, fixture);
    if (!fs.existsSync(filePath)) throw new Error(`No test fixture at [${filePath}]`);
    const response = await s3Client.send(
        new PutObjectCommand({
            Bucket: getOriginalImagesBucketName(),
            Key: fromPathToS3OriginalBucketKeyForUpload(mediaPath),
            Body: fs.createReadStream(filePath),
            ContentType: mime.getType(filePath) ?? undefined,
        }),
    );
    if (!response.VersionId) throw new Error(`No version ID from uploading [${mediaPath}]`);
    return response.VersionId;
}

export async function s3ObjectExists(bucket: string, key: string): Promise<boolean> {
    return !!(await headObject(bucket, key));
}

/** The object's metadata, or undefined if there is no such object */
export async function headObject(bucket: string, key: string): Promise<{ contentType?: string } | undefined> {
    try {
        const response = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { contentType: response.ContentType };
    } catch (e) {
        if (e instanceof NotFound) return undefined;
        throw e;
    }
}

/** @param mediaPath gallery path like /2001/12-31/image.jpg */
export function originalExists(mediaPath: string): Promise<boolean> {
    return s3ObjectExists(getOriginalImagesBucketName(), mediaPath.substring(1));
}

/** @param derivedPath path within the derived bucket, like /2001/12-31/image.jpg/VERSION/45x45 */
export function derivedExists(derivedPath: string): Promise<boolean> {
    return s3ObjectExists(getDerivedImagesBucketName(), `i${derivedPath}`);
}

export async function downloadOriginal(mediaPath: string): Promise<Buffer> {
    const response = await s3Client.send(
        new GetObjectCommand({ Bucket: getOriginalImagesBucketName(), Key: mediaPath.substring(1) }),
    );
    return Buffer.concat(await (response.Body as Readable).toArray());
}

/** Wait for the upload-processing Lambda to delete an original, as it does with a HEIC it converted */
export async function waitForOriginalDeleted(mediaPath: string): Promise<void> {
    await waitFor(async () => !(await originalExists(mediaPath)), {
        description: `[${mediaPath}] to be deleted from the originals bucket`,
    });
}
