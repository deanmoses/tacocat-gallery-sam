import { DeleteObjectCommand, HeadObjectCommand, NotFound, S3Client } from '@aws-sdk/client-s3';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { isValidAlbumPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { getOriginalImagesBucketName } from '../../lib/lambda_utils/Env';
import { assertDynamoDBItemDoesNotExist, cleanUpAlbum } from './helpers/albumHelpers';
import { assertOriginalImageDoesNotExist, originalImageExists, uploadBuffer } from './helpers/s3ImageHelper';

const yearPath = '/1714/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}01-01/`;
const corruptHeicPath = `${albumPath}corrupt.heic`;

/**
 * Check if a file exists in the quarantine folder
 */
async function quarantinedFileExists(imagePath: string): Promise<boolean> {
    const key = `quarantine${imagePath}`; // imagePath has leading slash, e.g. quarantine/1714/01-01/corrupt.heic
    const client = new S3Client({});
    try {
        const response = await client.send(
            new HeadObjectCommand({
                Bucket: getOriginalImagesBucketName(),
                Key: key,
            }),
        );
        return response.$metadata.httpStatusCode === 200;
    } catch (e) {
        if (e instanceof NotFound) {
            return false;
        }
        throw e;
    }
}

/**
 * Delete a quarantined file
 */
async function deleteQuarantinedFile(imagePath: string): Promise<void> {
    const key = `quarantine${imagePath}`; // imagePath has leading slash, e.g. quarantine/1714/01-01/corrupt.heic
    const client = new S3Client({});
    await client.send(
        new DeleteObjectCommand({
            Bucket: getOriginalImagesBucketName(),
            Key: key,
        }),
    );
}

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);

    await Promise.all([
        assertDynamoDBItemDoesNotExist(yearPath),
        assertDynamoDBItemDoesNotExist(albumPath),
        assertOriginalImageDoesNotExist(corruptHeicPath),
    ]);

    // Upload a corrupt HEIC file (just garbage bytes)
    await uploadBuffer(Buffer.from('not a valid heic file'), corruptHeicPath);

    // Wait for Lambda to process and quarantine the file
    await new Promise((r) => setTimeout(r, 5000));
}, 20000);

afterAll(async () => {
    // Clean up quarantined file
    try {
        await deleteQuarantinedFile(corruptHeicPath);
    } catch {
        // Ignore if doesn't exist
    }
    await cleanUpAlbum(albumPath);
    await cleanUpAlbum(yearPath);
});

test('Corrupt HEIC was quarantined (moved to quarantine/ prefix)', async () => {
    const exists = await quarantinedFileExists(corruptHeicPath);
    expect(exists).toBe(true);
});

test('Original corrupt HEIC was deleted from upload location', async () => {
    // The original file should be gone - replaced by the quarantined copy
    const exists = await originalImageExists(corruptHeicPath);
    expect(exists).toBe(false);
});

test('No DynamoDB entry was created for corrupt file', async () => {
    // The corrupt file should not create any album or image entries
    const albumExists = await itemExists(albumPath);
    expect(albumExists).toBe(false);
});
