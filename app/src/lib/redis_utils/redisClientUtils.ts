import { getRedisHost, getRedisPassword, getRedisUsername } from '../lambda_utils/Env';

/** Something like redis://username:passwored@host */
export function getRedisConnectionString() {
    const username = encodeURIComponent(getRedisUsername());
    const password = encodeURIComponent(getRedisPassword());
    const host = getRedisHost();
    return `redis://${username}:${password}@${host}`;
}
