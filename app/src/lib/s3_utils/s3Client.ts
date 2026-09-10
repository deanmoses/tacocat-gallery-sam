import { S3Client } from '@aws-sdk/client-s3';

/**
 * Shared S3 client.
 *
 * Constructed once per Lambda execution environment rather than per invocation,
 * so that the HTTPS connection is reused across warm invocations instead of
 * paying a fresh TLS handshake each time.
 */
export const s3Client = new S3Client({});
