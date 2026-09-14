import { Context } from 'aws-lambda';
import { syncAlbumVersions, SyncAlbumVersionsResult } from '../../lib/gallery/syncAlbumVersions/syncAlbumVersions';

/** Event shape for direct Lambda invocation */
export interface SyncAlbumVersionsEvent {
    /** Resume after this album path, from a previous run's nextStartAfter */
    startAfter?: string;
}

/**
 * Lambda that recomputes every album's edge cache version from DynamoDB.
 *
 * Invoke directly from the AWS Console with `{}`. If the result carries a
 * nextStartAfter, the run hit its time limit: invoke again with
 * `{ "startAfter": "<that path>" }` until it does not.
 */
export const handler = async (event: SyncAlbumVersionsEvent, context: Context): Promise<SyncAlbumVersionsResult> => {
    if (event?.startAfter !== undefined && typeof event.startAfter !== 'string') {
        throw new Error('startAfter must be an album path like /2001/12-31/');
    }
    return await syncAlbumVersions({
        startAfter: event?.startAfter,
        remainingMs: () => context.getRemainingTimeInMillis(),
    });
};
