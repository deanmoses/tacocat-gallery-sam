import { MediaConvertClient } from '@aws-sdk/client-mediaconvert';
import { getMediaConvertEndpoint } from './getMediaConvertEndpoint';

/**
 * Cached MediaConvert client.
 * Like the endpoint it is built from, this persists across warm invocations so
 * that the HTTPS connection is reused instead of re-handshaking on every call.
 */
let mediaConvertClient: MediaConvertClient | undefined;

/**
 * Get the shared MediaConvert client, constructed once per execution environment.
 */
export async function getMediaConvertClient(): Promise<MediaConvertClient> {
    if (!mediaConvertClient) {
        mediaConvertClient = new MediaConvertClient({ endpoint: await getMediaConvertEndpoint() });
    }
    return mediaConvertClient;
}
