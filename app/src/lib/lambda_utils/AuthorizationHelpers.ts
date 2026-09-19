import { APIGatewayProxyEvent } from 'aws-lambda';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { CognitoIdTokenPayload } from 'aws-jwt-verify/jwt-model';
import { UnauthorizedException } from './UnauthorizedException';
import { getHeader } from './HttpHeaders';

/**
 * Response header on which the read endpoints report what they made of the
 * request's auth cookie, so the gallery app can tell a guest view it asked for
 * from one it got because its token had expired.
 */
export const AUTH_STATUS_HEADER = 'X-Auth-Status';

/** `none`: no auth cookie. `valid`: a verified token. `invalid`: a cookie that failed verification, usually expired. */
export type ReadAuthStatus = 'none' | 'valid' | 'invalid';

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
    hydrate(): Promise<void>;
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

/**
 * Fetch Cognito's signing keys during cold start rather than on the first
 * verification. Concurrent verifications join the fetch already in flight, so
 * the network round trip is paid once per container and off the request path.
 * A failure here costs nothing: the next verification fetches again.
 */
function prefetchSigningKeys(): void {
    try {
        getVerifier()
            .hydrate()
            .catch((e: unknown) => {
                console.warn({ event: 'jwks_prefetch_failed', error: e instanceof Error ? e.message : String(e) });
            });
    } catch {
        // No Cognito configuration, as in unit tests: nothing to prefetch
    }
}
prefetchSigningKeys();

// --- Internal helper (not exported) ---

/**
 * Validate token, return payload on success, undefined on failure.
 * Logs specific error to CloudWatch before returning undefined.
 */
async function validateIdToken(token: string): Promise<CognitoIdTokenPayload | undefined> {
    try {
        return await getVerifier().verify(token);
    } catch (e) {
        console.warn({ event: 'jwt_validation_failed', error: e instanceof Error ? e.message : String(e) });
        return undefined;
    }
}

// --- Main entry points ---

/**
 * Whether the request carries an id_token cookie at all. Existence only, never
 * validity: for logging and cache keys, not for deciding what to serve.
 */
export function hasIdToken(event: APIGatewayProxyEvent): boolean {
    return !!getIdTokenFromCookies(getHeader(event, 'cookie'));
}

/**
 * What the read endpoints should make of the request's auth cookie.
 *
 * Reads never reject a request: an invalid token gets the public view, as a
 * missing one does. The distinction is reported so the client can refresh
 * its session and ask again.
 */
export async function getReadAuthStatus(event: APIGatewayProxyEvent): Promise<ReadAuthStatus> {
    const idToken = getIdTokenFromCookies(getHeader(event, 'cookie'));
    if (!idToken) return 'none';
    return (await validateIdToken(idToken)) ? 'valid' : 'invalid';
}

/**
 * True if the request carries a verified token, so unpublished content may be included.
 */
export async function isAuthenticatedForReads(event: APIGatewayProxyEvent): Promise<boolean> {
    return (await getReadAuthStatus(event)) === 'valid';
}

/**
 * Throws UnauthorizedException if not authenticated.
 * Performs full JWT validation for write operations.
 */
export async function ensureAuthorizedForWrites(event: APIGatewayProxyEvent): Promise<void> {
    const idToken = getIdTokenFromCookies(getHeader(event, 'cookie'));

    if (!idToken) {
        throw new UnauthorizedException('Unauthorized');
    }

    const payload = await validateIdToken(idToken);
    if (!payload) {
        throw new UnauthorizedException('Unauthorized');
    }
}
