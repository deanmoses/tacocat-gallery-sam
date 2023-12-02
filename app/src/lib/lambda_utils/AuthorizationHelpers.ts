import { APIGatewayProxyEvent } from 'aws-lambda';
import { UnauthorizedException } from './UnauthorizedException';

/**
 * Throw unauthorized exception if user is not authenticated
 */
export async function ensureAuthorized(event: APIGatewayProxyEvent): Promise<void> {
    if (!(await isAuthenticated(event))) {
        throw new UnauthorizedException('Unauthorized');
    }
}

/**
 * Return true if user is authenticated
 */
export async function isAuthenticated(event: APIGatewayProxyEvent): Promise<boolean> {
    const cookies = event.headers?.cookie;

    // Get the short-lived Cognito user ID token from cookie
    const rawIdToken = getCookie(cookies, 'id_token');

    // Get the longer-lived Cognito refresh token from cookie
    const refreshToken = getCookie(cookies, 'refresh_token');

    // TODO: actually validate the tokens

    return !!rawIdToken || !!refreshToken;
}

/**
 * Get cookie value
 *
 * @param cookieHeader Cookie header from API Gateway event
 * @param name Name of the cookie
 * @returns cookie value or undefined if not found
 */
function getCookie(cookieHeader: string | undefined, name: string): string | undefined {
    if (!cookieHeader) return;
    const nameLenPlus = name.length + 1;
    return cookieHeader
        .split(';')
        .map((c) => c.trim())
        .filter((cookie) => {
            return cookie.substring(0, nameLenPlus) === `${name}=`;
        })
        .map((cookie) => {
            return decodeURIComponent(cookie.substring(nameLenPlus));
        })[0];
}
