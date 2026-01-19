import { deleteMedia } from '../../lib/gallery/deleteMedia/deleteMedia';
import { getAlbumAndChildren } from '../../lib/gallery/getAlbum/getAlbum';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { updateAlbum } from '../../lib/gallery/updateAlbum/updateAlbum';
import { findMedia } from '../../lib/gallery_client/AlbumObject';
import { getParentFromPath, isValidAlbumPath, isValidVideoPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { assertDynamoDBItemDoesNotExist, cleanUpAlbum } from './helpers/albumHelpers';
import { reallyGetNameFromPath } from './helpers/pathHelpers';
import { uploadVideo, assertOriginalVideoDoesNotExist, originalVideoExists } from './helpers/s3VideoHelper';
import { VideoItem } from '../../lib/gallery/galleryTypes';
import { getFullItemFromDynamoDB } from '../../lib/dynamo_utils/ddbGet';
import { getDerivedImagesBucketName } from '../../lib/lambda_utils/Env';
import { HeadObjectCommand, S3Client, NotFound } from '@aws-sdk/client-s3';

const yearPath = '/1705/'; // unique to this suite to prevent pollution
const albumPath = `${yearPath}09-03/`;
const videoPath = `${albumPath}testvideo.mp4`;

// Helper to check if video transcoding has completed
async function waitForVideoProcessing(videoPath: string, timeoutMs: number = 180000): Promise<VideoItem | null> {
    const startTime = Date.now();
    const pollInterval = 5000; // Check every 5 seconds

    while (Date.now() - startTime < timeoutMs) {
        try {
            const item = await getFullItemFromDynamoDB<VideoItem>(videoPath);
            // Video processing is complete when the item has an 'id' (UUID) and mediaType is 'video'
            if (item && item.id && item.mediaType === 'video') {
                console.info(`Video processing complete for [${videoPath}]`);
                return item;
            }
        } catch (e) {
            // Item doesn't exist yet, keep waiting
            // Log unexpected errors for debugging (network issues, permissions, etc.)
            console.debug(`Poll attempt error: ${e instanceof Error ? e.message : String(e)}`);
        }
        console.info(`Waiting for video processing... elapsed: ${Math.round((Date.now() - startTime) / 1000)}s`);
        await new Promise((r) => setTimeout(r, pollInterval));
    }

    console.warn(`Video processing timed out after ${timeoutMs}ms for [${videoPath}]`);
    return null;
}

// Helper to check if video assets exist in derived bucket
async function videoAssetExists(uuid: string, extension: 'mp4' | 'jpg'): Promise<boolean> {
    const key = `video/${uuid}.${extension}`;
    const s3Command = new HeadObjectCommand({
        Bucket: getDerivedImagesBucketName(),
        Key: key,
    });
    const client = new S3Client({});
    try {
        const response = await client.send(s3Command);
        return response.$metadata.httpStatusCode === 200;
    } catch (e) {
        if (e instanceof NotFound) {
            return false;
        }
        throw e;
    }
}

let videoItem: VideoItem | null = null;

beforeAll(async () => {
    expect(isValidAlbumPath(yearPath)).toBe(true);
    expect(isValidAlbumPath(albumPath)).toBe(true);
    expect(isValidVideoPath(videoPath)).toBe(true);

    await Promise.all([
        assertDynamoDBItemDoesNotExist(yearPath),
        assertDynamoDBItemDoesNotExist(albumPath),
        assertOriginalVideoDoesNotExist(videoPath),
    ]);

    await uploadVideo('test_video.mp4', videoPath);

    // Wait for video processing (MediaConvert + Lambda)
    // This can take 1-3 minutes
    videoItem = await waitForVideoProcessing(videoPath, 180000);

    if (videoItem) {
        await updateAlbum(getParentFromPath(albumPath), { published: true });
        await updateAlbum(albumPath, { published: true });
    }
}, 200000); // 200 second timeout for beforeAll

afterAll(async () => {
    await cleanUpAlbum(albumPath);
    await cleanUpAlbum(yearPath);
});

test('Video processing completed', () => {
    expect(videoItem).not.toBeNull();
    expect(videoItem?.id).toBeDefined();
    expect(videoItem?.mediaType).toBe('video');
});

test('Parent album was created', async () => {
    if (!(await itemExists(albumPath))) throw new Error(`Album [${albumPath}] does not exist`);
});

test('Grandparent album was created', async () => {
    if (!(await itemExists(yearPath))) throw new Error(`Album [${yearPath}] does not exist`);
});

test('Video has required fields', () => {
    expect(videoItem).not.toBeNull();
    if (!videoItem) return;

    // Required fields for videos
    expect(videoItem.id).toBeDefined(); // UUID
    expect(videoItem.mediaType).toBe('video');
    expect(videoItem.versionId).toBeDefined();

    // Optional fields that should be set after transcoding
    // Duration and dimensions may or may not be extracted depending on the video
    console.info(
        `Video item: id=${videoItem.id}, duration=${videoItem.duration}, dimensions=${JSON.stringify(videoItem.dimensions)}`,
    );
});

test('Album contains video', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error('no album');
    const videoName = reallyGetNameFromPath(videoPath);
    const video = findMedia(album, videoName);
    if (!video) throw new Error(`Did not find video in album`);
    expect(video.parentPath).toBe(albumPath);
    expect(video.itemName).toBe(videoName);
});

test('Transcoded video exists in derived bucket', async () => {
    if (!videoItem?.id) {
        console.warn('Skipping - no video UUID');
        return;
    }
    const exists = await videoAssetExists(videoItem.id, 'mp4');
    expect(exists).toBe(true);
});

test('Video poster exists in derived bucket', async () => {
    if (!videoItem?.id) {
        console.warn('Skipping - no video UUID');
        return;
    }
    const exists = await videoAssetExists(videoItem.id, 'jpg');
    expect(exists).toBe(true);
});

test('Delete video', async () => {
    await expect(deleteMedia(videoPath)).resolves.not.toThrow();
});

test('Album should not contain deleted video', async () => {
    const album = await getAlbumAndChildren(albumPath);
    if (!album) throw new Error('no album');
    const videoName = reallyGetNameFromPath(videoPath);
    const video = findMedia(album, videoName);
    if (video) throw new Error(`Video [${videoName}] should not exist in album [${albumPath}]`);
});

test('Original video bucket should no longer contain video', async () => {
    if (await originalVideoExists(videoPath)) throw new Error(`[${videoPath}] should not exist in originals bucket`);
});

test('Transcoded video should be deleted from derived bucket', async () => {
    if (!videoItem?.id) {
        console.warn('Skipping - no video UUID');
        return;
    }
    const exists = await videoAssetExists(videoItem.id, 'mp4');
    expect(exists).toBe(false);
});

test('Video poster should be deleted from derived bucket', async () => {
    if (!videoItem?.id) {
        console.warn('Skipping - no video UUID');
        return;
    }
    const exists = await videoAssetExists(videoItem.id, 'jpg');
    expect(exists).toBe(false);
});
