import {
    syncRedis,
    initRedis,
    SyncMode,
    SyncResult,
    SyncErrorResult,
    InitResult,
} from '../../lib/gallery/syncRedis/syncRedis';

/** Event shape for direct Lambda invocation */
export interface SyncRedisEvent {
    mode: SyncMode;
    continuationToken?: string;
}

/**
 * Lambda function to sync DynamoDB to Redis.
 *
 * Invoke directly from AWS Console with:
 * - { "mode": "diagnose" } - Read-only comparison
 * - { "mode": "fix" } - Write corrections to Redis
 * - { "mode": "fix", "continuationToken": "..." } - Resume after failure
 * - { "mode": "init" } - Create search index if missing
 *
 * There's no API Gateway API for this Lambda because it
 * takes longer than API Gateway's max timeout, 29 seconds.
 */
export const handler = async (event: SyncRedisEvent): Promise<SyncResult | SyncErrorResult | InitResult> => {
    // Validate mode
    const validModes: SyncMode[] = ['diagnose', 'fix', 'init'];
    if (!event.mode || !validModes.includes(event.mode)) {
        throw new Error(`Invalid mode: "${event.mode}". Must be one of: ${validModes.join(', ')}`);
    }

    // Handle init mode separately
    if (event.mode === 'init') {
        return await initRedis({});
    }

    return await syncRedis({
        mode: event.mode,
        continuationToken: event.continuationToken,
    });
};
