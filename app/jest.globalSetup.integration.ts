/**
 * Runs once before the integration suites. The search index belongs to the
 * Redis environment rather than to any suite, so a wiped test Redis gets it
 * back here.
 */
import { initRedis } from './src/lib/gallery/syncRedis/syncRedis';

export default async function ensureSearchIndex(): Promise<void> {
    await initRedis({});
}
