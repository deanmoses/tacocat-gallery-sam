/**
 * One-time migration to fix image dimensions and tags in DynamoDB.
 *
 * Addresses two GitHub issues:
 * - #106: Images with EXIF orientations 5-8 were stored with raw pixel dimensions
 *   instead of display dimensions (width/height swapped).
 * - #109: Images missing tags in DynamoDB that exist in S3 IPTC/XMP metadata.
 *
 * This migration scans all images, compares DynamoDB records against S3 originals,
 * and corrects dimension and tag values where they differ.
 *
 * Also validates data quality by detecting:
 * - Corrupt images (ExifReader fails)
 * - Missing S3 images (orphaned DynamoDB records)
 * - Invalid versionId (DynamoDB references non-existent S3 version)
 *
 * This script is thoroughly unit tested, and could form the basis of
 * future migration scripts or a general-purpose data validation tool.
 *
 * @see https://github.com/deanmoses/tacocat-gallery-sam/issues/106
 * @see https://github.com/deanmoses/tacocat-gallery-sam/issues/109
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import ExifReader from 'exifreader';
import { Readable } from 'stream';
import { getChildItems } from '../../dynamo_utils/ddbGet';
import { getDynamoDbTableName, getOriginalImagesBucketName } from '../../lambda_utils/Env';
import {
    getParentAndNameFromPath,
    getParentFromPath,
    isValidImagePath,
    toImagePath,
    toAlbumPath,
} from '../../gallery_path_utils/galleryPathUtils';
import { AlbumItem, ImageItem, Size } from '../galleryTypes';
import { selectMetadata } from '../../../lambdas/processImageUpload/extractImageMetadata';
import { mergeTags } from '../upsertImage/upsertImage';

/** Migration mode: diagnose (read-only) or fix (write corrections) */
export type MigrateMode = 'diagnose' | 'fix';

/** Input for migration */
export interface MigrateInput {
    mode: MigrateMode;
    /** Process a single image */
    image?: string;
    /** Resume from this image path (skip newer albums and earlier images) */
    startFrom?: string;
}

/** Issue types that can be detected */
export type IssueType =
    | 'corrupt'
    | 'missingFromS3'
    | 'dimensionsOrientation'
    | 'dimensionsOther'
    | 'tagsMismatch'
    | 'versionIdInvalid';

/** A single issue found during migration */
export interface Issue {
    path: string;
    type: IssueType;
    details: string;
    fixed?: boolean;
}

/** Issue types that can be automatically fixed */
const FIXABLE_ISSUE_TYPES: IssueType[] = ['dimensionsOrientation', 'tagsMismatch'];

/** Check if an issue type can be automatically fixed */
function isFixableIssueType(type: IssueType): boolean {
    return FIXABLE_ISSUE_TYPES.includes(type);
}

/** Result of migration */
export interface MigrateResult {
    albumsChecked: number;
    imagesChecked: number;
    issuesFound: number;
    issuesFixable: number;
    issuesUnfixable: number;
    issuesFixed: number;
    durationMs: number;
    stoppedEarly: boolean;
    startFrom?: string;
    error?: string;
    issues: Issue[];
}

/** Result from processing a single image */
interface ImageProcessResult {
    path: string;
    issues: Issue[];
    issuesFixed: number;
}

/** Options for dependency injection in tests */
export interface MigrateOptions {
    docClient?: DynamoDBDocumentClient;
    s3Client?: S3Client;
}

/** Number of images to process concurrently */
const CHUNK_SIZE = 30;
/** Stop early after this many unfixable issues (indicates unexpected data problems) */
const MAX_UNFIXABLE_ISSUES = 20;
/** Stop early after this many total issues (prevent OOM on large migrations) */
const MAX_ISSUES = 300;
/** Stop logging individual issues after this many (issues still collected in result) */
const MAX_ISSUES_TO_LOG = 100;

/**
 * Migrate image dimensions in DynamoDB.
 * Validates images against S3 and fixes orientation-based dimension issues.
 */
export async function migrateDimensions(input: MigrateInput, options: MigrateOptions = {}): Promise<MigrateResult> {
    const startTime = Date.now();

    // Reset logging counter for this invocation (important for warm Lambda reuse)
    issuesLogged = 0;

    // Validate input
    validateInput(input);

    const { mode, image, startFrom } = input;
    console.log(JSON.stringify({ event: 'migrate_start', mode, image, startFrom }));

    // Set up clients
    const docClient = options.docClient ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
    const s3Client = options.s3Client ?? new S3Client({});

    const result: MigrateResult = {
        albumsChecked: 0,
        imagesChecked: 0,
        issuesFound: 0,
        issuesFixable: 0,
        issuesUnfixable: 0,
        issuesFixed: 0,
        durationMs: 0,
        stoppedEarly: false,
        issues: [],
    };

    let unfixableIssueCount = 0;
    let currentImagePath: string | undefined;

    try {
        if (image) {
            // Single image mode
            currentImagePath = image; // Set before lookup for error reporting
            const imageItem = await getImageFromDynamoDB(image);
            if (!imageItem) {
                throw new Error(`Image not found in DynamoDB: ${image}`);
            }
            const imgResult = await processImage(imageItem, image, mode, docClient, s3Client);
            result.issues.push(...imgResult.issues);
            result.issuesFixed += imgResult.issuesFixed;
            result.imagesChecked = 1;
            result.albumsChecked = 1;
        } else {
            // Process all albums
            const startFromParts = startFrom ? parseImagePath(startFrom) : undefined;

            // Get year albums, sort descending
            const yearAlbums = await getYearAlbums();
            const sortedYears = yearAlbums.sort((a, b) => (b.itemName ?? '').localeCompare(a.itemName ?? ''));

            for (const yearAlbum of sortedYears) {
                const yearPath = toAlbumPath(yearAlbum.parentPath, yearAlbum.itemName);

                // Skip years newer than startFrom
                if (startFromParts && yearPath > startFromParts.yearPath) {
                    continue;
                }

                // Get day albums for this year, sort descending
                const dayAlbums = await getDayAlbums(yearPath);
                const sortedDays = dayAlbums.sort((a, b) => (b.itemName ?? '').localeCompare(a.itemName ?? ''));

                for (const dayAlbum of sortedDays) {
                    const albumPath = toAlbumPath(dayAlbum.parentPath, dayAlbum.itemName);

                    // Skip albums newer than startFrom
                    if (startFromParts && albumPath > startFromParts.albumPath) {
                        continue;
                    }

                    // Get images for this album, sort ascending
                    const images = await getImagesInAlbum(albumPath);
                    const sortedImages = images.sort((a, b) => (a.itemName ?? '').localeCompare(b.itemName ?? ''));

                    // Filter images if resuming within this album
                    let imagesToProcess = sortedImages;
                    if (startFromParts && albumPath === startFromParts.albumPath) {
                        imagesToProcess = sortedImages.filter(
                            (img) => (img.itemName ?? '') >= startFromParts.imageName,
                        );
                    }

                    // Process images in chunks
                    for (let i = 0; i < imagesToProcess.length; i += CHUNK_SIZE) {
                        const chunk = imagesToProcess.slice(i, i + CHUNK_SIZE);

                        // Track the first image in chunk for accurate resume on error
                        const firstImageInChunk = toImagePath(chunk[0].parentPath, chunk[0].itemName);
                        currentImagePath = firstImageInChunk;

                        // Process chunk concurrently, collect results
                        const chunkResults = await Promise.all(
                            chunk.map(async (img) => {
                                const imgPath = toImagePath(img.parentPath, img.itemName);
                                return await processImage(img, imgPath, mode, docClient, s3Client);
                            }),
                        );

                        // Aggregate results sequentially after concurrent work completes
                        for (const imgResult of chunkResults) {
                            result.imagesChecked++;
                            result.issues.push(...imgResult.issues);
                            result.issuesFixed += imgResult.issuesFixed;

                            // Count unfixable issues
                            for (const issue of imgResult.issues) {
                                if (!isFixableIssueType(issue.type)) {
                                    unfixableIssueCount++;
                                }
                            }
                        }

                        // Check fail-fast conditions (use first image in chunk for accurate resume)
                        if (unfixableIssueCount >= MAX_UNFIXABLE_ISSUES) {
                            result.stoppedEarly = true;
                            result.startFrom = firstImageInChunk;
                            console.log(
                                JSON.stringify({
                                    event: 'migrate_stopped_early',
                                    reason: 'max_unfixable_issues',
                                    count: unfixableIssueCount,
                                    startFrom: firstImageInChunk,
                                }),
                            );
                            break;
                        }
                        if (result.issues.length >= MAX_ISSUES) {
                            result.stoppedEarly = true;
                            result.startFrom = firstImageInChunk;
                            console.log(
                                JSON.stringify({
                                    event: 'migrate_stopped_early',
                                    reason: 'max_issues',
                                    count: result.issues.length,
                                    startFrom: firstImageInChunk,
                                }),
                            );
                            break;
                        }
                    }

                    if (result.stoppedEarly) break;
                    result.albumsChecked++;
                }

                if (result.stoppedEarly) break;
            }
        }
    } catch (e) {
        result.stoppedEarly = true;
        result.startFrom = currentImagePath;
        result.error = e instanceof Error ? e.message : String(e);
        console.error(
            JSON.stringify({
                event: 'migrate_error',
                error: result.error,
                startFrom: currentImagePath,
            }),
        );
        // Continue to return result with error info instead of throwing
    }

    result.durationMs = Date.now() - startTime;
    result.issuesFound = result.issues.length;
    result.issuesFixable = result.issues.filter((i) => isFixableIssueType(i.type)).length;
    result.issuesUnfixable = result.issuesFound - result.issuesFixable;

    console.log(
        JSON.stringify({
            event: result.error ? 'migrate_error_complete' : 'migrate_complete',
            mode,
            albumsChecked: result.albumsChecked,
            imagesChecked: result.imagesChecked,
            issuesFound: result.issuesFound,
            issuesFixable: result.issuesFixable,
            issuesUnfixable: result.issuesUnfixable,
            issuesFixed: result.issuesFixed,
            stoppedEarly: result.stoppedEarly,
            durationMs: result.durationMs,
            error: result.error,
        }),
    );

    return result;
}

/** Validate migration input */
function validateInput(input: MigrateInput): void {
    const allowedFields = new Set(['mode', 'image', 'startFrom']);
    for (const key of Object.keys(input)) {
        if (!allowedFields.has(key)) {
            throw new Error(`Unknown field: ${key}`);
        }
    }

    if (!input.mode || !['diagnose', 'fix'].includes(input.mode)) {
        throw new Error(`Invalid mode: ${input.mode}. Must be 'diagnose' or 'fix'.`);
    }

    if (input.image !== undefined && !isValidImagePath(input.image)) {
        throw new Error(`Invalid image path: ${input.image}`);
    }

    if (input.startFrom !== undefined && !isValidImagePath(input.startFrom)) {
        throw new Error(`Invalid startFrom path: ${input.startFrom}`);
    }

    if (input.image && input.startFrom) {
        throw new Error(`Cannot specify both 'image' and 'startFrom'`);
    }
}

/** Parse an image path into its components */
function parseImagePath(imagePath: string): { yearPath: string; albumPath: string; imageName: string } {
    const parts = getParentAndNameFromPath(imagePath);
    const albumPath = parts.parent; // e.g., /2024/01-15/
    const imageName = parts.name ?? '';
    // Get year path from album path (e.g., /2024/01-15/ -> /2024/)
    const yearPath = getParentFromPath(albumPath);
    return { yearPath, albumPath, imageName };
}

/** Get year albums from root */
async function getYearAlbums(): Promise<AlbumItem[]> {
    const children = await getChildItems('/');
    return (children ?? []).filter((item): item is AlbumItem => item.itemType === 'album');
}

/** Get day albums for a year */
async function getDayAlbums(yearPath: string): Promise<AlbumItem[]> {
    const children = await getChildItems(yearPath);
    return (children ?? []).filter((item): item is AlbumItem => item.itemType === 'album');
}

/** Get images in an album */
async function getImagesInAlbum(albumPath: string): Promise<ImageItem[]> {
    const children = await getChildItems(albumPath);
    return (children ?? []).filter((item): item is ImageItem => item.itemType === 'image');
}

/** Get a single image from DynamoDB */
async function getImageFromDynamoDB(imagePath: string): Promise<ImageItem | undefined> {
    const parts = getParentAndNameFromPath(imagePath);
    const children = await getChildItems(parts.parent);
    return children?.find((item): item is ImageItem => item.itemType === 'image' && item.itemName === parts.name);
}

/** Process a single image, returns issues found */
async function processImage(
    imageItem: ImageItem,
    imagePath: string,
    mode: MigrateMode,
    docClient: DynamoDBDocumentClient,
    s3Client: S3Client,
): Promise<ImageProcessResult> {
    const imgResult: ImageProcessResult = { path: imagePath, issues: [], issuesFixed: 0 };

    try {
        // Fetch image from S3
        const s3Key = imagePath.slice(1); // Remove leading /
        const bucket = getOriginalImagesBucketName();

        let s3Data: { buffer: Buffer; versionId?: string };
        try {
            // Only pass versionId if truthy (avoid sending empty string to S3)
            s3Data = await fetchImageFromS3(s3Client, bucket, s3Key, imageItem.versionId || undefined);
        } catch (e) {
            if (e instanceof Error && e.name === 'NoSuchKey') {
                addIssue(imgResult, imagePath, 'missingFromS3', 'Image exists in DynamoDB but not in S3');
                return imgResult;
            }
            if (e instanceof Error && (e.name === 'NoSuchVersion' || e.message.includes('version'))) {
                addIssue(imgResult, imagePath, 'versionIdInvalid', `S3 versionId not found: ${imageItem.versionId}`);
                return imgResult;
            }
            throw e;
        }

        // Check versionId (only if DynamoDB has one and we fetched latest)
        if (imageItem.versionId && s3Data.versionId && imageItem.versionId !== s3Data.versionId) {
            addIssue(
                imgResult,
                imagePath,
                'versionIdInvalid',
                `DynamoDB versionId (${imageItem.versionId}) doesn't match S3 current version (${s3Data.versionId})`,
            );
        }

        // Extract metadata from image using the same logic as the upload pipeline
        let tags: ExifReader.ExpandedTags;
        try {
            tags = await ExifReader.load(s3Data.buffer, { async: true, expanded: true });
        } catch (e) {
            addIssue(
                imgResult,
                imagePath,
                'corrupt',
                `Failed to extract metadata: ${e instanceof Error ? e.message : e}`,
            );
            return imgResult;
        }

        const s3Metadata = selectMetadata(tags);

        // Check dimensions
        const s3Dimensions = s3Metadata.dimensions;
        if (s3Dimensions) {
            const ddbDimensions = imageItem.dimensions;
            if (
                !ddbDimensions ||
                ddbDimensions.width !== s3Dimensions.width ||
                ddbDimensions.height !== s3Dimensions.height
            ) {
                // Determine if this is an orientation issue
                const orientation = tags.exif?.Orientation?.value;
                const isOrientationIssue = typeof orientation === 'number' && orientation >= 5 && orientation <= 8;

                if (isOrientationIssue) {
                    const issue = addIssue(
                        imgResult,
                        imagePath,
                        'dimensionsOrientation',
                        `DynamoDB: ${ddbDimensions?.width}x${ddbDimensions?.height}, S3 (corrected): ${s3Dimensions.width}x${s3Dimensions.height}`,
                    );

                    if (mode === 'fix') {
                        await updateDimensions(docClient, imagePath, s3Dimensions);
                        issue.fixed = true;
                        imgResult.issuesFixed++;
                    }
                } else {
                    addIssue(
                        imgResult,
                        imagePath,
                        'dimensionsOther',
                        `DynamoDB: ${ddbDimensions?.width}x${ddbDimensions?.height}, S3: ${s3Dimensions.width}x${s3Dimensions.height}`,
                    );
                }
            }
        }

        // Check tags - merge S3 tags into DynamoDB (same logic as upsertImage)
        const s3Tags = s3Metadata.tags;
        const ddbTags = imageItem.tags;
        const mergedTags = mergeTags(ddbTags, s3Tags);

        // Only report/fix if S3 has tags that DynamoDB is missing
        const ddbTagSet = new Set(ddbTags ?? []);
        const s3HasNewTags = (s3Tags ?? []).some((tag) => !ddbTagSet.has(tag));

        if (s3HasNewTags) {
            const issue = addIssue(
                imgResult,
                imagePath,
                'tagsMismatch',
                `DynamoDB: [${(ddbTags ?? []).join(', ')}], S3: [${(s3Tags ?? []).join(', ')}], merged: [${(mergedTags ?? []).join(', ')}]`,
            );

            if (mode === 'fix' && mergedTags) {
                await updateTags(docClient, imagePath, mergedTags);
                issue.fixed = true;
                imgResult.issuesFixed++;
            }
        }
    } catch (e) {
        console.error(
            JSON.stringify({
                event: 'process_image_error',
                path: imagePath,
                error: e instanceof Error ? e.message : String(e),
            }),
        );
        throw e;
    }

    return imgResult;
}

/** Fetch image from S3 */
async function fetchImageFromS3(
    s3Client: S3Client,
    bucket: string,
    key: string,
    versionId?: string,
): Promise<{ buffer: Buffer; versionId?: string }> {
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        VersionId: versionId,
    });
    const response = await s3Client.send(command);
    if (!response.Body) {
        throw new Error(`S3 returned empty body for ${key}`);
    }
    const stream = response.Body as Readable;
    const buffer = Buffer.concat(await stream.toArray());
    return { buffer, versionId: response.VersionId };
}

/** Global counter for logging cap */
let issuesLogged = 0;

/** Add an issue to a result (works with both MigrateResult and ImageProcessResult) */
function addIssue(result: { issues: Issue[] }, path: string, type: IssueType, details: string): Issue {
    const issue: Issue = { path, type, details };
    result.issues.push(issue);

    if (issuesLogged < MAX_ISSUES_TO_LOG) {
        console.log(JSON.stringify({ event: 'issue_found', path, type, details }));
        issuesLogged++;
    }

    return issue;
}

/** Update dimensions in DynamoDB */
async function updateDimensions(docClient: DynamoDBDocumentClient, imagePath: string, dimensions: Size): Promise<void> {
    const parts = getParentAndNameFromPath(imagePath);
    const command = new UpdateCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: parts.parent,
            itemName: parts.name,
        },
        UpdateExpression: 'SET dimensions = :dimensions, updatedOn = :updatedOn',
        ExpressionAttributeValues: {
            ':dimensions': dimensions,
            ':updatedOn': new Date().toISOString(),
        },
    });
    await docClient.send(command);
    console.log(JSON.stringify({ event: 'dimensions_updated', path: imagePath, dimensions }));
}

/** Update tags in DynamoDB */
async function updateTags(docClient: DynamoDBDocumentClient, imagePath: string, tags: string[]): Promise<void> {
    const parts = getParentAndNameFromPath(imagePath);
    const command = new UpdateCommand({
        TableName: getDynamoDbTableName(),
        Key: {
            parentPath: parts.parent,
            itemName: parts.name,
        },
        UpdateExpression: 'SET tags = :tags, updatedOn = :updatedOn',
        ExpressionAttributeValues: {
            ':tags': tags,
            ':updatedOn': new Date().toISOString(),
        },
    });
    await docClient.send(command);
    console.log(JSON.stringify({ event: 'tags_updated', path: imagePath, tags }));
}
