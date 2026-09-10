import { createClient } from 'redis';
import {
    getRedisHost,
    getRedisSearchPassword,
    getRedisSearchUsername,
    getRedisWritePassword,
    getRedisWriteUsername,
} from '../lambda_utils/Env';

export const SEARCH_INDEX_NAME = 'idx:gallery';

/**
 * Derive the client type from an actual `createClient` call rather than from
 * `ReturnType<typeof createClient>`. The latter widens the generics to their
 * constraints, which stopped compiling in node-redis v6: the call site now
 * infers a concrete `RESP: 3`, and `RespVersions` (2 | 3) is not assignable
 * to `3`. Deriving from the real construction keeps the type in step with
 * whatever options we pass.
 */
export type RedisClient = ReturnType<typeof createRedisClient>;

function createRedisClient(url: string) {
    return createClient({ url });
}

/** Get Redis client that can write */
export async function createRedisWriteClient(): Promise<RedisClient> {
    return await createRedisClient(getRedisWriteConnectionString()).connect();
}

/** Get Redis client that can search but not write */
export async function createRedisSearchClient(): Promise<RedisClient> {
    return await createRedisClient(getRedisSearchConnectionString()).connect();
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
