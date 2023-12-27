import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBBatchResponse, DynamoDBStreamEvent, DynamoDBStreamHandler } from 'aws-lambda';
import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { toRedisItem } from '../../lib/redis_utils/toRedisFromDynamo';
import { RedisGalleryItem } from '../../lib/redis_utils/redisTypes';
import { saveToRedis } from '../../lib/redis_utils/redisMset';
import { isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';
import { createRedisWriteClient } from '../../lib/redis_utils/redisClientUtils';

/**
 * A Lambda that receives DynamoDB stream events and replicates the data to Redis
 */
export const handler: DynamoDBStreamHandler = async (event: DynamoDBStreamEvent, context, callback) => {
    console.info(`DynamoDB to Redis: processing ${event?.Records?.length} records`);
    const { itemsToSave, pathsToDelete } = toRedisItems(event);
    console.info(`DynamoDB to Redis: saving ${itemsToSave.length} items and deleting ${pathsToDelete.length}`);
    syncToRedis(itemsToSave, pathsToDelete);
    console.info(`DynamoDB to Redis: processed ${event?.Records?.length} records`);
    callback(null);
};

/** Extract Redis items from DynamoDB stream event */
function toRedisItems(event: DynamoDBStreamEvent): { itemsToSave: RedisGalleryItem[]; pathsToDelete: string[] } {
    const itemsToSave: RedisGalleryItem[] = [];
    const pathsToDelete: string[] = [];
    for (const record of event.Records) {
        if (record?.dynamodb?.NewImage) {
            const newImage = unmarshall(record.dynamodb.NewImage as { [key: string]: AttributeValue });
            const redisItem = toRedisItem(newImage);
            itemsToSave.push(redisItem);
            console.log(`${record.eventName}: %j`, redisItem);
        } else if ('REMOVE' === record.eventName) {
            const parentPath = record.dynamodb?.Keys?.['parentPath']?.S;
            const itemName = record.dynamodb?.Keys?.['itemName']?.S;
            const path = toPath(parentPath, itemName);
            pathsToDelete.push(path);
            console.log(`${record.eventName}: ${path}`);
        } else {
            console.info(`DynamoDB to Redis: unhandled event [${record.eventName}]`);
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
            redisClient.quit();
        }
    }
}

/** Make album/image path from item */
function toPath(parentPath: string | undefined, itemName: string | undefined): string {
    if (!parentPath) throw new Error(`Missing parentPath`);
    if (!itemName) throw new Error(`Missing itemName`);
    const path = `${parentPath}${itemName}`;
    return isValidImagePath(path) ? path : path + '/';
}
