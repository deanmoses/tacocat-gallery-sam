import { MediaConvertClient, GetJobCommand, VideoDetail } from '@aws-sdk/client-mediaconvert';
import { getMediaConvertEndpoint } from './getMediaConvertEndpoint';

export interface MediaConvertJobMetadata {
    duration: number;
    dimensions: { width: number; height: number };
}

/**
 * Get metadata (duration and dimensions) from a completed MediaConvert job.
 *
 * @param jobId MediaConvert job ID
 * @returns Job metadata including duration (seconds) and dimensions
 */
export async function getMediaConvertJobMetadata(jobId: string): Promise<MediaConvertJobMetadata> {
    const endpoint = await getMediaConvertEndpoint();
    const mediaConvertClient = new MediaConvertClient({ endpoint });

    const response = await mediaConvertClient.send(new GetJobCommand({ Id: jobId }));
    const job = response.Job;

    // Extract duration and dimensions from job output details
    let duration = 0;
    let width = 0;
    let height = 0;

    // Look for video details in output group details
    const outputGroupDetails = job?.OutputGroupDetails;
    if (outputGroupDetails) {
        for (const group of outputGroupDetails) {
            const outputDetails = group.OutputDetails;
            if (outputDetails) {
                for (const output of outputDetails) {
                    const videoDetails = output.VideoDetails as VideoDetail | undefined;
                    if (videoDetails) {
                        if (videoDetails.WidthInPx) width = videoDetails.WidthInPx;
                        if (videoDetails.HeightInPx) height = videoDetails.HeightInPx;
                    }
                    // Duration is in milliseconds in the output details
                    if (output.DurationInMs) {
                        duration = Math.round(output.DurationInMs / 1000);
                    }
                }
            }
        }
    }

    // Log warning if duration extraction failed
    if (duration === 0) {
        console.warn(JSON.stringify({ event: 'mediaconvert_duration_extraction_failed', jobId }));
    }

    return {
        duration,
        dimensions: { width, height },
    };
}
