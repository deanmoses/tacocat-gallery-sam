import { APIGatewayProxyEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { CognitoIdTokenPayload } from 'aws-jwt-verify/jwt-model';
import { UnauthorizedException } from './UnauthorizedException';

// --- Pure function (easily testable) ---

/**
 * Extract id_token from cookie header string
 */
export function getIdTokenFromCookies(cookieHeader: string | undefined): string | undefined {
    if (!cookieHeader) return;
    const name = 'id_token';
    const nameLenPlus = name.length + 1;
    const match = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((cookie) => cookie.substring(0, nameLenPlus) === `${name}=`);
    return match ? decodeURIComponent(match.substring(nameLenPlus)) : undefined;
}

// --- Verifier (module-level singleton, reused across invocations) ---

interface TokenVerifier {
    verify(token: string): Promise<CognitoIdTokenPayload>;
}

let verifier: TokenVerifier | undefined;

function getVerifier(): TokenVerifier {
    if (!verifier) {
        const userPoolId = process.env.COGNITO_USER_POOL_ID;
        const clientId = process.env.COGNITO_CLIENT_ID;

        if (!userPoolId || !clientId) {
            throw new Error(
                'Missing required environment variables: ' +
                    `COGNITO_USER_POOL_ID=${userPoolId ? 'set' : 'MISSING'}, ` +
                    `COGNITO_CLIENT_ID=${clientId ? 'set' : 'MISSING'}`,
            );
        }

        verifier = CognitoJwtVerifier.create({
            userPoolId,
            tokenUse: 'id',
            clientId,
        });
    }
    return verifier;
}

/**
 * For testing: allow injecting a mock verifier
 */
export function setVerifierForTesting(mockVerifier: TokenVerifier | undefined): void {
    verifier = mockVerifier;
}

// --- Internal helper (not exported) ---

/**
 * Validate token, return payload on success, undefined on failure.
 * Logs specific error to CloudWatch before returning undefined.
 */
async function validateIdToken(token: string): Promise<CognitoIdTokenPayload | undefined> {
    try {
        return await getVerifier().verify(token);
    } catch (e) {
        console.warn('JWT validation failed:', e instanceof Error ? e.message : e);
        return undefined;
    }
}

// --- Main entry points ---

/**
 * Returns true if request has a token (existence check only, no validation).
 * Used for read operations to decide whether to include unpublished content.
 * Fast path: ~0ms since it just checks cookie existence.
 */
export function isAuthenticatedForReads(event: APIGatewayProxyEvent): boolean {
    const cookies = event.headers?.cookie;
    const idToken = getIdTokenFromCookies(cookies);
    return !!idToken;
}

/**
 * Throws UnauthorizedException if not authenticated.
 * Performs full JWT validation for write operations.
 */
export async function ensureAuthorizedForWrites(event: APIGatewayProxyEvent): Promise<void> {
    const cookies = event.headers?.cookie;
    const idToken = getIdTokenFromCookies(cookies);

    if (!idToken) {
        throw new UnauthorizedException('Unauthorized');
    }

    const payload = await validateIdToken(idToken);
    if (!payload) {
        throw new UnauthorizedException('Unauthorized');
    }
}
