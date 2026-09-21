import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { DynamoDBStreamEvent, DynamoDBStreamHandler } from 'aws-lambda';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { toRedisItem } from '../../lib/redis_utils/toRedisFromDynamo';
import type { RedisGalleryItem } from '../../lib/redis_utils/redisTypes';
import { saveToRedis } from '../../lib/redis_utils/redisMset';
import { toPathFromKey } from '../../lib/gallery_path_utils/galleryPathUtils';
import { createRedisWriteClient } from '../../lib/redis_utils/redisClientUtils';
import type { GalleryItem } from '../../lib/gallery/galleryTypes';

/**
 * A Lambda that receives DynamoDB stream events and replicates the data to Redis
 */
export const handler: DynamoDBStreamHandler = async (event) => {
    console.info({ event: 'dynamo_to_redis_started', recordCount: event?.Records?.length });
    const { itemsToSave, pathsToDelete } = toRedisItems(event);
    console.info({
        event: 'dynamo_to_redis_syncing',
        saveCount: itemsToSave.length,
        deleteCount: pathsToDelete.length,
    });
    await syncToRedis(itemsToSave, pathsToDelete);
    console.info({ event: 'dynamo_to_redis_complete', recordCount: event?.Records?.length });
};

/** Extract Redis items from DynamoDB stream event */
function toRedisItems(event: DynamoDBStreamEvent): { itemsToSave: RedisGalleryItem[]; pathsToDelete: string[] } {
    const itemsToSave: RedisGalleryItem[] = [];
    const pathsToDelete: string[] = [];
    for (const record of event.Records) {
        if (record?.dynamodb?.NewImage) {
            const newImage = unmarshall(record.dynamodb.NewImage as { [key: string]: AttributeValue }) as GalleryItem;
            const redisItem = toRedisItem(newImage);
            itemsToSave.push(redisItem);
            console.info({ event: 'redis_item_upsert', dynamoEvent: record.eventName, item: redisItem });
        } else if ('REMOVE' === record.eventName) {
            const parentPath = record.dynamodb?.Keys?.parentPath?.S;
            const itemName = record.dynamodb?.Keys?.itemName?.S;
            const path = toPathFromKey(parentPath, itemName);
            pathsToDelete.push(path);
            console.info({ event: 'redis_item_delete', dynamoEvent: record.eventName, path });
        } else {
            console.warn({ event: 'dynamo_to_redis_unhandled_event', dynamoEvent: record.eventName });
        }
    }
    return { itemsToSave, pathsToDelete };
}

/** Create/update/delete items in Redis */
async function syncToRedis(itemsToSave: RedisGalleryItem[], pathsToDelete: string[]) {
    if (itemsToSave.length > 0 || pathsToDelete.length > 0) {
        const redisClient = await createRedisWriteClient();
        try {
            if (itemsToSave.length > 0) await saveToRedis(redisClient, itemsToSave);
            if (pathsToDelete.length > 0) await redisClient.del(pathsToDelete);
        } finally {
            await redisClient.close();
        }
    }
}
