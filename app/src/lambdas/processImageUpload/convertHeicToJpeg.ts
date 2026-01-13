import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { getJpegOriginalQuality } from '../../lib/lambda_utils/Env';

/**
 * Error thrown when Sharp fails to process an image.
 * Used to distinguish file processing errors (which should quarantine)
 * from infrastructure errors like S3 (which should propagate for retry).
 */
export class SharpProcessingError extends Error {
    readonly cause?: unknown;
    constructor(message: string, cause?: unknown) {
        super(message);
        this.name = 'SharpProcessingError';
        this.cause = cause;
    }
}

/**
 * Convert a HEIC/HEIF file to JPEG and save to S3.
 *
 * @param bucket S3 bucket name
 * @param heicKey S3 key of the HEIC file (e.g., '2024/01-15/photo.heic')
 * @returns The key of the new JPEG file
 */
export async function convertHeicToJpeg(bucket: string, heicKey: string): Promise<string> {
    const jpegKey = heicKey.replace(/\.(heic|heif)$/i, '.jpg');
    console.info(`HEIC conversion: ${heicKey} -> ${jpegKey}`);

    const client = new S3Client({});

    // Download HEIC from S3
    const getResponse = await client.send(
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
    // Wrap only Sharp call - S3 errors should propagate for Lambda retry
    let jpegBuffer: Buffer;
    try {
        jpegBuffer = await sharp(heicBuffer).keepMetadata().jpeg({ quality: getJpegOriginalQuality() }).toBuffer();
    } catch (error) {
        throw new SharpProcessingError(`Failed to convert HEIC to JPEG: ${heicKey}`, error);
    }

    // Upload JPEG to S3
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: jpegKey,
            Body: jpegBuffer,
            ContentType: 'image/jpeg',
        }),
    );

    // Delete original HEIC
    await client.send(
        new DeleteObjectCommand({
            Bucket: bucket,
            Key: heicKey,
        }),
    );

    console.info(`HEIC converted: ${heicKey} -> ${jpegKey}`);
    return jpegKey;
}
