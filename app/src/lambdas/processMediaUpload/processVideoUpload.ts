import { MediaConvertClient, CreateJobCommand, CreateJobRequest } from '@aws-sdk/client-mediaconvert';
import { randomUUID } from 'crypto';
import { isValidVideoPath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { getFullItemFromDynamoDB } from '../../lib/dynamo_utils/ddbGet';
import {
    getMediaConvertRoleArn,
    getDerivedImagesBucketName,
    getOriginalImagesBucketName,
} from '../../lib/lambda_utils/Env';
import { getMediaConvertEndpoint } from '../../lib/mediaconvert_utils/getMediaConvertEndpoint';
import { getDerivedAssetIdVersionPrefix } from '../../lib/s3_utils/s3path';
import { VideoItem } from '../../lib/gallery/galleryTypes';
import { JPEG_ORIGINAL_QUALITY } from './mediaProcessingConstants';
import { recordMediaProcessingError } from '../../lib/dynamo_utils/recordError';
import { revertS3Version } from '../../lib/s3_utils/s3revertVersion';

// Video transcoding settings
const VIDEO_MAX_BITRATE = 5_000_000; // 5 Mbps - good quality for web delivery
const VIDEO_QUALITY_LEVEL = 7; // QVBR quality level (1-10, higher = better)
const AUDIO_BITRATE = 128_000; // 128 kbps AAC - standard for web video

/**
 * Process a video file uploaded to S3 by creating a MediaConvert job.
 * MediaConvert will transcode the video to MP4 and generate a poster image.
 * On completion, EventBridge triggers VideoTranscodingComplete Lambda.
 *
 * @param bucket name of S3 bucket that file is in
 * @param key key of S3 object to process
 * @param versionId versionId of S3 object
 */
export async function processVideoUpload(bucket: string, key: string, versionId: string | undefined): Promise<void> {
    const videoPath = '/' + key;
    console.info(JSON.stringify({ event: 'video_processing_started', videoPath }));

    if (!isValidVideoPath(videoPath)) {
        throw new Error(`Video Processor: invalid video path [${videoPath}]`);
    }
    if (!bucket) {
        throw new Error(`Video Processor: invalid bucket name [${bucket}]`);
    }
    if (!versionId) {
        throw new Error(`Video Processor: missing versionId`);
    }

    // Check for existing video record to reuse UUID on re-uploads
    const existingVideo = await getExistingVideoRecord(videoPath);
    if (existingVideo && !existingVideo.id) {
        throw new Error(`Video Processor: existing video record missing id [${videoPath}]`);
    }
    const videoId = existingVideo?.id || randomUUID();

    try {
        await createMediaConvertJob(bucket, key, versionId, videoPath, videoId);
        console.info(JSON.stringify({ event: 'mediaconvert_job_created', videoPath, videoId }));
    } catch (error) {
        // MediaConvert job creation failed - clean up and record error
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
            JSON.stringify({ event: 'mediaconvert_job_creation_failed', videoPath, videoId, error: errorMessage }),
        );

        // Record error for frontend to display
        await recordMediaProcessingError(videoPath, `Video processing failed: ${errorMessage}`);

        // Revert to previous version (or delete if first version)
        await revertS3Version(bucket, key, versionId);

        // Don't rethrow - we've handled the error by recording it and cleaning up
    }
}

async function getExistingVideoRecord(videoPath: string): Promise<VideoItem | undefined> {
    const item = await getFullItemFromDynamoDB<VideoItem>(videoPath);
    return item?.mediaType === 'video' ? item : undefined;
}

/**
 * Create an AWS MediaConvert job to transcode a video and generate a poster image.
 *
 * @param bucket S3 bucket containing the original video
 * @param key S3 object key of the original video
 * @param versionId S3 version ID of the original video
 * @param videoPath Gallery path of the video (e.g., /2024/06-15/video.mp4)
 * @param videoId DynamoDB ID for the video
 */
async function createMediaConvertJob(
    bucket: string,
    key: string,
    versionId: string,
    videoPath: string,
    videoId: string,
): Promise<void> {
    const endpoint = await getMediaConvertEndpoint();
    const client = new MediaConvertClient({ endpoint });

    const roleArn = getMediaConvertRoleArn();
    const derivedBucket = getDerivedImagesBucketName();
    const originalBucket = getOriginalImagesBucketName();

    const inputS3Path = `s3://${originalBucket}/${key}`;
    // We let MediaConvert use the original filename, then rename in VideoTranscodingComplete.
    // MediaConvert output naming: <Destination><input_filename_without_ext><NameModifier>.<extension>
    // MediaConvert outputs: <filename>_transcoded.mp4 and <filename>_poster.0000000.jpg
    // VideoTranscodingComplete renames to: transcoded and poster
    const outputS3Path = `s3://${derivedBucket}/${getDerivedAssetIdVersionPrefix(videoId, versionId)}`;

    const jobParams: CreateJobRequest = {
        Role: roleArn,
        UserMetadata: {
            source: derivedBucket, // Used by EventBridge to filter events for this stack
            path: videoPath,
            versionId: versionId,
            id: videoId,
        },
        Settings: {
            Inputs: [
                {
                    FileInput: inputS3Path,
                    AudioSelectors: {
                        'Audio Selector 1': {
                            Offset: 0,
                            DefaultSelection: 'DEFAULT',
                            SelectorType: 'TRACK',
                            Tracks: [1],
                        },
                    },
                    VideoSelector: {},
                    TimecodeSource: 'ZEROBASED',
                },
            ],
            OutputGroups: [
                {
                    // MP4 video output
                    Name: 'MP4 Output',
                    OutputGroupSettings: {
                        Type: 'FILE_GROUP_SETTINGS',
                        FileGroupSettings: {
                            Destination: outputS3Path,
                        },
                    },
                    Outputs: [
                        {
                            ContainerSettings: {
                                Container: 'MP4',
                                Mp4Settings: {},
                            },
                            VideoDescription: {
                                CodecSettings: {
                                    Codec: 'H_264',
                                    H264Settings: {
                                        RateControlMode: 'QVBR',
                                        QvbrSettings: {
                                            QvbrQualityLevel: VIDEO_QUALITY_LEVEL,
                                        },
                                        MaxBitrate: VIDEO_MAX_BITRATE,
                                        SceneChangeDetect: 'TRANSITION_DETECTION',
                                    },
                                },
                            },
                            AudioDescriptions: [
                                {
                                    AudioSourceName: 'Audio Selector 1',
                                    CodecSettings: {
                                        Codec: 'AAC',
                                        AacSettings: {
                                            Bitrate: AUDIO_BITRATE,
                                            CodingMode: 'CODING_MODE_2_0',
                                            SampleRate: 48000,
                                        },
                                    },
                                },
                            ],
                            NameModifier: '_transcoded',
                        },
                    ],
                },
                {
                    // Thumbnail/poster image output
                    Name: 'Thumbnail Output',
                    OutputGroupSettings: {
                        Type: 'FILE_GROUP_SETTINGS',
                        FileGroupSettings: {
                            Destination: outputS3Path,
                        },
                    },
                    Outputs: [
                        {
                            ContainerSettings: {
                                Container: 'RAW',
                            },
                            VideoDescription: {
                                CodecSettings: {
                                    Codec: 'FRAME_CAPTURE',
                                    FrameCaptureSettings: {
                                        FramerateNumerator: 1,
                                        FramerateDenominator: 1,
                                        MaxCaptures: 1,
                                        Quality: JPEG_ORIGINAL_QUALITY,
                                    },
                                },
                            },
                            NameModifier: '_poster',
                        },
                    ],
                },
            ],
        },
    };

    await client.send(new CreateJobCommand(jobParams));
}
