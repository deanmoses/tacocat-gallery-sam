import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { recordMediaProcessingError } from '../../lib/dynamo_utils/recordError';
import { JPEG_ORIGINAL_QUALITY } from './mediaProcessingConstants';
import { HEIC_EXTENSIONS } from '../../lib/gallery_path_utils/galleryPathUtils';

const s3Client = new S3Client({});

/**
 * Process a HEIC/HEIF upload by converting to JPEG and saving to S3.
 * S3 will re-trigger the Lambda for the new JPEG.
 *
 * On conversion failure: deletes the HEIC and writes error to error table.
 *
 * @param bucket S3 bucket name
 * @param heicKey S3 key of the HEIC file (e.g., '2024/01-15/photo.heic')
 * @returns The key of the new JPEG file
 */
export async function processHeicUpload(bucket: string, heicKey: string): Promise<string> {
    const heicPath = '/' + heicKey;
    const heicExtPattern = new RegExp(`\\.(${HEIC_EXTENSIONS.join('|')})$`, 'i');
    const jpegKey = heicKey.replace(heicExtPattern, '.jpg');
    console.info(JSON.stringify({ event: 'heic_conversion_started', heicKey, jpegKey }));

    // Download HEIC from S3
    const getResponse = await s3Client.send(
        new GetObjectCommand({
            Bucket: bucket,
            Key: heicKey,
        }),
    );

    if (!getResponse.Body) {
        throw new Error(`Failed to get HEIC file body: ${heicKey}`);
    }

    // Convert to Buffer
    const heicBuffer = Buffer.from(await getResponse.Body.transformToByteArray());

    // Convert HEIC to JPEG using Sharp
    let jpegBuffer: Buffer;
    try {
        jpegBuffer = await sharp(heicBuffer).keepMetadata().jpeg({ quality: JPEG_ORIGINAL_QUALITY }).toBuffer();
    } catch (error) {
        // Conversion failed - record error and delete the HEIC
        // Each step is independent - don't let one failure prevent the others
        // Record error first so user sees feedback even if cleanup fails
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(JSON.stringify({ event: 'heic_conversion_failed', key: heicKey, error: errorMessage }));

        let errorRecorded = false;
        let fileDeleted = false;

        errorRecorded = await recordMediaProcessingError(heicPath, `HEIC conversion failed: ${errorMessage}`);

        try {
            await s3Client.send(
                new DeleteObjectCommand({
                    Bucket: bucket,
                    Key: heicKey,
                }),
            );
            fileDeleted = true;
            console.info(JSON.stringify({ event: 'heic_deleted', key: heicKey }));
        } catch (deleteError) {
            console.error(JSON.stringify({ event: 'heic_delete_failed', key: heicKey, error: String(deleteError) }));
        }

        console.info(JSON.stringify({ event: 'heic_cleanup_complete', key: heicKey, errorRecorded, fileDeleted }));
        return ''; // Return empty string to indicate failure
    }

    // Upload JPEG to S3
    await s3Client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: jpegKey,
            Body: jpegBuffer,
            ContentType: 'image/jpeg',
        }),
    );

    // Delete original HEIC
    await s3Client.send(
        new DeleteObjectCommand({
            Bucket: bucket,
            Key: heicKey,
        }),
    );

    console.info(JSON.stringify({ event: 'heic_conversion_complete', heicKey, jpegKey }));
    return jpegKey;
}
