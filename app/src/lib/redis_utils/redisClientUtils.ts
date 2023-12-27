import { createClient } from 'redis';
import {
    getRedisHost,
    getRedisSearchPassword,
    getRedisSearchUsername,
    getRedisWritePassword,
    getRedisWriteUsername,
} from '../lambda_utils/Env';

export const SEARCH_INDEX_NAME = 'idx:gallery';

export type RedisClient = ReturnType<typeof createClient>;

/** Get Redis client that can write */
export async function createRedisWriteClient(): Promise<RedisClient> {
    return await createClient({ url: getRedisWriteConnectionString() }).connect();
}

/** Get Redis client that can search but not write */
export async function createRedisSearchClient(): Promise<RedisClient> {
    return await createClient({ url: getRedisSearchConnectionString() }).connect();
}

/** Something like redis://username:passwored@host */
function getRedisSearchConnectionString() {
    const username = encodeURIComponent(getRedisSearchUsername());
    const password = encodeURIComponent(getRedisSearchPassword());
    const host = getRedisHost();
    return `redis://${username}:${password}@${host}`;
}

/** Something like redis://username:passwored@host */
function getRedisWriteConnectionString() {
    const username = encodeURIComponent(getRedisWriteUsername());
    const password = encodeURIComponent(getRedisWritePassword());
    const host = getRedisHost();
    return `redis://${username}:${password}@${host}`;
}
