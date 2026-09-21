import assert from 'node:assert/strict';
import { deleteAlbum } from '../../../lib/gallery/deleteAlbum/deleteAlbum';
import { deleteMedia } from '../../../lib/gallery/deleteMedia/deleteMedia';
import { Album, ImageItem, VideoItem } from '../../../lib/gallery/galleryTypes';
import { getAlbumAndChildren } from '../../../lib/gallery/getAlbum/getAlbum';
import { itemExists } from '../../../lib/gallery/itemExists/itemExists';
import { updateAlbum } from '../../../lib/gallery/updateAlbum/updateAlbum';
import { findMedia } from '../../../lib/gallery_client/AlbumObject';
import {
    getParentAndNameFromPath,
    getParentFromPath,
    isValidDayAlbumPath,
    isValidImagePath,
    isValidYearAlbumPath,
    toPathFromItem,
} from '../../../lib/gallery_path_utils/galleryPathUtils';
import { getItem } from '../../../lib/dynamo_utils/ddbGet';
import { deleteOriginalsAndDerivativesForAlbum } from '../../../lib/s3_utils/s3delete';
import { uploadMedia } from './s3';
import { waitFor } from './waitFor';

/**
 * Upload images into a day album that does not exist yet, wait for the
 * upload-processing Lambda to write their items (which also creates the day
 * and year albums), then publish both albums.
 *
 * @param albumPath day album like /1701/12-31/
 * @param images image name in the album to fixture file in the test data folder, like { 'image1.jpg': 'images/image.jpg' }
 * @returns S3 version ID of each upload, keyed by image path
 */
export async function setUpAlbumWithImages(
    albumPath: string,
    images: Record<string, string>,
    { publish = true } = {},
): Promise<Record<string, string>> {
    assert(isValidDayAlbumPath(albumPath), `Invalid day album path [${albumPath}]`);
    // With the uploads overlapping, which image the Lambda picks as the album thumbnail is arbitrary
    const versionIds = Object.fromEntries(
        await Promise.all(
            Object.entries(images).map(async ([imageName, fixture]) => {
                const imagePath = albumPath + imageName;
                assert(isValidImagePath(imagePath), `Invalid image path [${imagePath}]`);
                const versionId = await uploadMedia(fixture, imagePath);
                await waitForMediaItem(imagePath);
                return [imagePath, versionId] as const;
            }),
        ),
    );
    if (publish) await publishAlbumAndYear(albumPath);
    return versionIds;
}

/** A day album cannot be published before its year */
export async function publishAlbumAndYear(albumPath: string): Promise<void> {
    await updateAlbum(getParentFromPath(albumPath), { published: true });
    await updateAlbum(albumPath, { published: true });
}

/** Wait for the upload-processing Lambda to write the media's DynamoDB item */
export async function waitForMediaItem(mediaPath: string, timeoutMs?: number): Promise<void> {
    await waitFor(() => itemExists(mediaPath), { description: `DynamoDB item [${mediaPath}] to exist`, timeoutMs });
}

/** Wait for the upload-processing Lambda to record the given S3 version of the media */
export async function waitForMediaVersion(mediaPath: string, versionId: string): Promise<void> {
    await waitFor(async () => (await getItem<ImageItem>(mediaPath, ['versionId']))?.versionId === versionId, {
        description: `DynamoDB item [${mediaPath}] to have version [${versionId}]`,
    });
}

/** Retrieve the album with its children, failing the test if it is not there */
export async function getAlbumOrFail(albumPath: string, includeUnpublished = false): Promise<Album> {
    const album = await getAlbumAndChildren(albumPath, includeUnpublished);
    assert(album, `No album [${albumPath}]`);
    return album;
}

/** Retrieve a media item through its album, failing the test if either is not there */
export async function getMediaOrFail(mediaPath: string, includeUnpublished = false): Promise<ImageItem | VideoItem> {
    const { parent, name } = getParentAndNameFromPath(mediaPath);
    const album = await getAlbumOrFail(parent, includeUnpublished);
    const media = findMedia(album, name);
    assert(media, `Album [${parent}] has no media [${name}]`);
    return media;
}

/**
 * Delete a year album, its day albums and all their media from DynamoDB and
 * S3, tolerating whatever state a failed run left behind.
 *
 * @param yearPath year album like /1701/
 */
export async function cleanUpYear(yearPath: string): Promise<void> {
    assert(isValidYearAlbumPath(yearPath), `Refusing to clean up [${yearPath}]: not a year album`);
    const year = await getAlbumAndChildren(yearPath, true);
    for (const day of year?.children ?? []) {
        await cleanUpAlbum(toPathFromItem(day));
    }
    await deleteIfExists(yearPath);
    // Media the processing Lambda wrote to S3 but never recorded in DynamoDB
    await deleteOriginalsAndDerivativesForAlbum(yearPath);
}

/**
 * Delete a day album and its media from DynamoDB and S3, tolerating whatever
 * state a failed run left behind. Leaves the year album alone.
 *
 * @param albumPath day album like /1701/12-31/
 */
export async function cleanUpAlbum(albumPath: string): Promise<void> {
    assert(isValidDayAlbumPath(albumPath), `Refusing to clean up [${albumPath}]: not a day album`);
    const album = await getAlbumAndChildren(albumPath, true);
    await Promise.all((album?.children ?? []).map((media) => deleteMedia(toPathFromItem(media))));
    await deleteIfExists(albumPath);
    await deleteOriginalsAndDerivativesForAlbum(albumPath);
}

async function deleteIfExists(albumPath: string): Promise<void> {
    if (await itemExists(albumPath)) await deleteAlbum(albumPath);
}
