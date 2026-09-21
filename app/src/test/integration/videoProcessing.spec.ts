import { deleteMedia } from '../../lib/gallery/deleteMedia/deleteMedia';
import { VideoItem } from '../../lib/gallery/galleryTypes';
import { itemExists } from '../../lib/gallery/itemExists/itemExists';
import { findMedia } from '../../lib/gallery_client/AlbumObject';
import { getFullItemFromDynamoDB } from '../../lib/dynamo_utils/ddbGet';
import { getDerivedImagesBucketName } from '../../lib/lambda_utils/Env';
import { getTranscodedVideoS3Key, getVideoPosterS3Key } from '../../lib/s3_utils/s3path';
import { cleanUpYear, getAlbumOrFail, publishAlbumAndYear } from './helpers/fixtures';
import { headObject, originalExists, uploadMedia } from './helpers/s3';
import { TEST_YEARS } from './helpers/testYears';
import { waitFor } from './helpers/waitFor';

const yearPath = TEST_YEARS.videoProcessing;
const albumPath = `${yearPath}09-03/`;
const videoName = 'testvideo.mp4';
const videoPath = albumPath + videoName;
let video: VideoItem;

/** MediaConvert usually takes ten seconds or so on the test video, but has no upper bound; the item is written when the job completes */
function waitForVideoProcessing(): Promise<VideoItem> {
    return waitFor(
        async () => {
            const item = await getFullItemFromDynamoDB<VideoItem>(videoPath);
            return item?.versionId && item.mediaType === 'video' ? item : undefined;
        },
        { description: `video [${videoPath}] to finish processing`, timeoutMs: 180_000, intervalMs: 2_000 },
    );
}

function transcodedVideo() {
    return headObject(getDerivedImagesBucketName(), getTranscodedVideoS3Key(videoPath, video.versionId));
}

function poster() {
    return headObject(getDerivedImagesBucketName(), getVideoPosterS3Key(videoPath, video.versionId));
}

beforeAll(async () => {
    await cleanUpYear(yearPath);
    await uploadMedia('videos/test_video.mp4', videoPath);
    video = await waitForVideoProcessing();
    await publishAlbumAndYear(albumPath);
}, 200_000);

afterAll(() => cleanUpYear(yearPath));

describe('after uploading a video into an album that did not exist', () => {
    it('the day and year albums were created', async () => {
        await expect(itemExists(albumPath)).resolves.toBe(true);
        await expect(itemExists(yearPath)).resolves.toBe(true);
    });

    it('the album lists the video', async () => {
        const listed = findMedia(await getAlbumOrFail(albumPath), videoName);

        expect(listed?.parentPath).toBe(albumPath);
        expect(listed?.versionId).toBe(video.versionId);
    });

    it('the derived bucket holds the transcoded video as MP4', async () => {
        await expect(transcodedVideo()).resolves.toStrictEqual({ contentType: 'video/mp4' });
    });

    it('the derived bucket holds the poster as JPEG', async () => {
        await expect(poster()).resolves.toStrictEqual({ contentType: 'image/jpeg' });
    });
});

describe('after deleting the video', () => {
    beforeAll(() => deleteMedia(videoPath));

    it('the album no longer lists it', async () => {
        expect(findMedia(await getAlbumOrFail(albumPath), videoName)).toBeUndefined();
    });

    it('the originals bucket no longer holds it', async () => {
        await expect(originalExists(videoPath)).resolves.toBe(false);
    });

    it('the derived bucket no longer holds the transcoded video or the poster', async () => {
        await expect(transcodedVideo()).resolves.toBeUndefined();
        await expect(poster()).resolves.toBeUndefined();
    });
});
