import { DynamoDBStreamHandler } from 'aws-lambda';
import { updateKeyValues } from '../../lib/cloudfront_utils/keyValueStore';
import { batchFromStream, computeAlbumVersionUpdates } from '../../lib/gallery/updateAlbumVersions/updateAlbumVersions';

/**
 * A Lambda that receives DynamoDB stream events and refreshes the album
 * versions the API edge cache keys on, in the CloudFront KeyValueStore.
 *
 * Throws on failure so the stream retries the batch: a version left behind
 * keeps serving the old album until the edge cache entry expires.
 */
export const handler: DynamoDBStreamHandler = async (event) => {
    const batch = batchFromStream(event);
    console.info({ event: 'album_versions_started', recordCount: event?.Records?.length, changedPaths: batch.paths });
    const updates = await computeAlbumVersionUpdates(batch);
    await updateKeyValues(updates);
    console.info({
        event: 'album_versions_complete',
        puts: Object.fromEntries(updates.puts),
        deletes: [...updates.deletes],
    });
};
