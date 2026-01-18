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
    await handleVideoTranscodingComplete(event as unknown as MediaConvertJobStateChangeEvent);
};
