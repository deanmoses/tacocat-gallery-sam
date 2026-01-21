import { MediaConvertClient, DescribeEndpointsCommand } from '@aws-sdk/client-mediaconvert';

/**
 * Cached MediaConvert endpoint URL.
 * Module-level variables persist across Lambda warm invocations (same container reused),
 * so we only call DescribeEndpoints once per cold start instead of every invocation.
 */
let mediaConvertEndpoint: string | undefined;

/**
 * Get the MediaConvert endpoint URL.
 * The endpoint is cached in a module-level variable for Lambda warm starts.
 *
 * @returns MediaConvert endpoint URL
 */
export async function getMediaConvertEndpoint(): Promise<string> {
    if (mediaConvertEndpoint) {
        return mediaConvertEndpoint;
    }

    const client = new MediaConvertClient({});
    const response = await client.send(new DescribeEndpointsCommand({}));
    mediaConvertEndpoint = response.Endpoints?.[0]?.Url;

    if (!mediaConvertEndpoint) {
        throw new Error('Could not retrieve MediaConvert endpoint');
    }

    return mediaConvertEndpoint;
}
