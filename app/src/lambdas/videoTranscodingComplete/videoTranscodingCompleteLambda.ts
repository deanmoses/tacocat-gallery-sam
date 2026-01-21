import { EventBridgeHandler } from 'aws-lambda';
import { handleVideoTranscodingComplete, MediaConvertJobStateChangeEvent } from './videoTranscodingComplete';

/**
 * Lambda handler for video transcoding completion events.
 * Triggered by EventBridge when MediaConvert jobs complete, error, or are canceled.
 *
 * On COMPLETE: writes DynamoDB record with video metadata (id, mediaType, duration, dimensions, versionId)
 * On ERROR/CANCELED: writes to error table, deletes original file, cleans up partial outputs
 */
export const handler: EventBridgeHandler<'MediaConvert Job State Change', unknown, void> = async (event) => {
    console.info('VideoTranscodingComplete: received event', JSON.stringify(event, null, 2));
    try {
        await handleVideoTranscodingComplete(event as unknown as MediaConvertJobStateChangeEvent);
    } catch (err) {
        console.error(
            JSON.stringify({
                event: 'video_transcoding_complete_error',
                error: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
            }),
        );
        throw err;
    }
};
