import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDbTableName } from '../../lambda_utils/Env';
import { toRedisItem } from '../../redis_utils/toRedisFromDynamo';
import { RedisClient, SEARCH_INDEX_NAME, createRedisWriteClient } from '../../redis_utils/redisClientUtils';
import { ErrorReply } from 'redis';
import { SCHEMA_FIELD_TYPE } from '@redis/search';
import { saveToRedis } from '../../redis_utils/redisMset';

/**
 * Reset and reload Redis.
 * Deletes all keys and the index, re-creates index, re-loads all the data from DynamoDB.
 */
export async function resetAndReloadRedis(): Promise<void> {
    const redisClient = await createRedisWriteClient();
    try {
        console.info(`Dropping index`);
        await dropIndex(redisClient);
        console.info(`Flushing keys`);
        await redisClient.flushDb();
        console.info(`Creating index`);
        await createIndex(redisClient);
        console.info(`Loading DynamoDB data into Redis`);
        await load(redisClient);
        console.info(`Redis reset complete`);
    } finally {
        await redisClient.quit();
    }
}

/** Drop index */
async function dropIndex(redisClient: RedisClient): Promise<void> {
    try {
        await redisClient.ft.dropIndex(SEARCH_INDEX_NAME);
    } catch (e) {
        // If the index doesn't exist, Redis throws an error with the message "Unknown Index name"
        if (e instanceof ErrorReply && !e.message.toLowerCase().includes('unknown')) throw e;
    }
}

/** Create index */
async function createIndex(redisClient: RedisClient): Promise<void> {
    await redisClient.ft.create(
        SEARCH_INDEX_NAME,
        {
            '$.itemType': {
                type: SCHEMA_FIELD_TYPE.TAG,
                AS: 'itemType',
            },
            '$.itemNameSearchable': {
                type: SCHEMA_FIELD_TYPE.TEXT,
                AS: 'name',
            },
            '$.description': {
                type: SCHEMA_FIELD_TYPE.TEXT,
                AS: 'description',
            },
            '$.title': {
                type: SCHEMA_FIELD_TYPE.TEXT,
                AS: 'title',
            },
            '$.summary': {
                type: SCHEMA_FIELD_TYPE.TEXT,
                AS: 'summary',
            },
            '$.tags': {
                type: SCHEMA_FIELD_TYPE.TEXT,
                AS: 'tags',
            },
            '$.albumDate': {
                type: SCHEMA_FIELD_TYPE.NUMERIC,
                AS: 'date',
                SORTABLE: true,
            },
        },
        { ON: 'JSON' },
    );
}

/** Load all DynamoDB records into Redis */
async function load(redisClient: RedisClient): Promise<void> {
    const ddbClient = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(ddbClient);
    let lastEvaluatedKey = undefined;
    do {
        const ddbCommand: ScanCommand = new ScanCommand({
            TableName: getDynamoDbTableName(),
            ExclusiveStartKey: lastEvaluatedKey,
        });
        const ddbResponse = await docClient.send(ddbCommand);
        if (!ddbResponse.Items?.length) throw new Error(`DynamoDB scan returned no items`);
        const redisItems = ddbResponse.Items?.map((item) => toRedisItem(item));
        if (!redisItems.length) throw new Error(`No items to save`);
        console.info(`Saving ${redisItems.length} items to Redis`);
        await saveToRedis(redisClient, redisItems);
        lastEvaluatedKey = ddbResponse.LastEvaluatedKey;
    } while (lastEvaluatedKey);
}
