import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * Shared DynamoDB document client.
 *
 * Constructed once per Lambda execution environment rather than per invocation.
 * Each client gets its own HTTPS connection pool, so a client built inside a
 * handler pays a fresh TLS handshake to DynamoDB on every request; a shared
 * module-scope client keeps the connection alive across warm invocations.
 */
export const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
