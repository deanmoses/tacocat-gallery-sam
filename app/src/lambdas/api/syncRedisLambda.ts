import { APIGatewayProxyEvent, APIGatewayProxyResult, Handler } from 'aws-lambda';
import { LambdaClient, InvokeCommand, InvocationType } from '@aws-sdk/client-lambda';
import { handleHttpExceptions, respondHttp } from '../../lib/lambda_utils/ApiGatewayResponseHelpers';
import { ensureAuthorized } from '../../lib/lambda_utils/AuthorizationHelpers';
import { syncRedis, initRedis, SyncMode, SyncResult, InitResult } from '../../lib/gallery/syncRedis/syncRedis';
import { BadRequestException } from '../../lib/lambda_utils/BadRequestException';

// Reuse client across warm invocations
const lambdaClient = new LambdaClient({});

/** Event shape for direct Lambda invocation (bypasses API Gateway) */
interface DirectInvokeEvent {
    mode: SyncMode;
    continuationToken?: string;
}

/** Combined event type for both API Gateway and direct invoke */
export type SyncRedisEvent = APIGatewayProxyEvent | DirectInvokeEvent;

/**
 * Lambda function to sync DynamoDB to Redis.
 *
 * API Gateway routes (all invoke Lambda asynchronously and return immediately):
 * - GET /redis-sync - Diagnose mode (read-only)
 * - POST /redis-sync - Fix mode (write corrections)
 * - PUT /redis-sync - Init mode (create search index)
 *
 * Direct invoke (for debugging or resuming from error):
 * - { "mode": "diagnose" }
 * - { "mode": "fix" }
 * - { "mode": "fix", "continuationToken": "..." } - Retry failed batch
 * - { "mode": "init" } - Create search index if missing
 */
export const handler: Handler<SyncRedisEvent, APIGatewayProxyResult | SyncResult | InitResult> = async (event) => {
    // Detect direct invoke vs API Gateway
    // API Gateway always has requestContext; direct invoke with { mode: "..." } does not
    const isDirectInvoke = !('requestContext' in event);

    if (isDirectInvoke) {
        // Direct Lambda invocation - no auth needed (AWS console access is privileged)
        const directEvent = event as DirectInvokeEvent;

        // Validate mode
        const validModes: SyncMode[] = ['diagnose', 'fix', 'init'];
        if (!directEvent.mode || !validModes.includes(directEvent.mode)) {
            throw new Error(`Invalid mode: "${directEvent.mode}". Must be one of: ${validModes.join(', ')}`);
        }

        // Handle init mode separately
        if (directEvent.mode === 'init') {
            return await initRedis({});
        }

        return await syncRedis({
            mode: directEvent.mode,
            continuationToken: directEvent.continuationToken,
        });
    }

    // API Gateway invocation
    const apiEvent = event as APIGatewayProxyEvent;
    try {
        // Require authentication
        await ensureAuthorized(apiEvent);

        // Determine mode from HTTP method
        // GET = diagnose (read-only), POST = fix (write corrections), PUT = init (create index)
        let mode: SyncMode;

        if (apiEvent.httpMethod === 'GET') {
            mode = 'diagnose';
        } else if (apiEvent.httpMethod === 'POST') {
            mode = 'fix';
        } else if (apiEvent.httpMethod === 'PUT') {
            mode = 'init';
        } else {
            throw new BadRequestException('Only GET, POST, and PUT methods are supported');
        }

        // Invoke self asynchronously to avoid API Gateway 29-second timeout.
        // The async payload { mode } matches the direct invoke event shape,
        // so it will be processed by the isDirectInvoke branch above.
        await lambdaClient.send(
            new InvokeCommand({
                FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME,
                InvocationType: InvocationType.Event, // Async - returns immediately
                Payload: JSON.stringify({ mode }),
            }),
        );

        return respondHttp(apiEvent, {
            event: 'sync_started',
            mode,
            message: 'Sync started. Check CloudWatch logs for progress.',
        });
    } catch (e) {
        return handleHttpExceptions(apiEvent, e);
    }
};
