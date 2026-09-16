import { createHash } from 'crypto';

/**
 * Serialize with object keys sorted at every level, so two objects holding the
 * same data hash the same whatever order their keys were assigned in. DynamoDB
 * makes no promise about attribute order, so JSON.stringify alone would not do.
 */
export function stableStringify(value: unknown): string {
    return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};
        for (const key of Object.keys(record).sort()) {
            sorted[key] = sortKeys(record[key]);
        }
        return sorted;
    }
    return value;
}

/**
 * First 16 hex characters of the SHA-256 of the string: 64 bits, which is
 * plenty to tell one version of an album from another and short enough to
 * live in a header, an ETag and a CloudFront KeyValueStore value.
 */
export function shortHash(s: string): string {
    return createHash('sha256').update(s).digest('hex').substring(0, 16);
}
