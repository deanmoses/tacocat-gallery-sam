import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DynamoDBStreamEvent, DynamoDBStreamHandler } from 'aws-lambda';
import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { toRedisItem } from './convertDynamoToRedis';
import { RedisGalleryItem } from '../../lib/redis_utils/redisTypes';
import { saveToRedis } from './redisMset';
import { deleteFromRedis } from './redisDelete';
import { isValidImagePath } from '../../lib/gallery_path_utils/galleryPathUtils';

/**
 * A Lambda that receives DynamoDB stream events and replicates the data to Redis
 */
export const handler: DynamoDBStreamHandler = async (event: DynamoDBStreamEvent) => {
    console.info(`DynamoDB to Redis: processing ${event?.Records?.length} records`);
    const itemsToSave: RedisGalleryItem[] = [];
    const pathsToDelete: string[] = [];
    for (const record of event.Records) {
        if (record.dynamodb && record.dynamodb.NewImage) {
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
    console.info(`DynamoDB to Redis: saving ${itemsToSave.length} items and deleting ${pathsToDelete.length}`);
    if (itemsToSave.length > 0) await saveToRedis(itemsToSave);
    if (pathsToDelete.length > 0) await deleteFromRedis(pathsToDelete);
    console.info(`DynamoDB to Redis: processed ${event?.Records?.length} records`);
};

function toPath(parentPath: string | undefined, itemName: string | undefined): string {
    if (!parentPath) throw new Error(`Missing parentPath`);
    if (!itemName) throw new Error(`Missing itemName`);
    const path = `${parentPath}${itemName}`;
    return path + isValidImagePath(path) ? '' : '/';
}
