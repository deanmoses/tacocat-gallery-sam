import { MediaConvertClient } from '@aws-sdk/client-mediaconvert';

/**
 * Cached MediaConvert client.
 * Persists across warm invocations so that the HTTPS connection is reused
 * instead of re-handshaking on every call.
 */
let mediaConvertClient: MediaConvertClient | undefined;

export function getMediaConvertClient(): MediaConvertClient {
    mediaConvertClient ??= new MediaConvertClient({});
    return mediaConvertClient;
}
