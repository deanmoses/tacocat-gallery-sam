import { APIGatewayProxyEvent } from 'aws-lambda';
import {
    getIdTokenFromCookies,
    isAuthenticatedForReads,
    ensureAuthorizedForWrites,
    setVerifierForTesting,
} from './AuthorizationHelpers';
import { UnauthorizedException } from './UnauthorizedException';

// Helper to create a mock API Gateway event with cookies
function createMockEvent(cookieHeader?: string): APIGatewayProxyEvent {
    return {
        headers: cookieHeader ? { cookie: cookieHeader } : {},
        body: null,
        httpMethod: 'GET',
        isBase64Encoded: false,
        path: '/',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as APIGatewayProxyEvent['requestContext'],
        resource: '',
        multiValueHeaders: {},
    };
}

// Mock token payload for testing - using minimal shape that satisfies the verifier
const mockPayload = {
    sub: 'user-123',
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test',
    aud: 'test-client-id',
    token_use: 'id' as const,
    auth_time: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
};

describe('getIdTokenFromCookies', () => {
    describe('returns undefined for missing/empty cookies', () => {
        const testCases = [undefined, '', '   '];
        testCases.forEach((cookieHeader) => {
            it(`should return undefined for: ${JSON.stringify(cookieHeader)}`, () => {
                expect(getIdTokenFromCookies(cookieHeader)).toBeUndefined();
            });
        });
    });

    describe('returns undefined when id_token is not present', () => {
        const testCases = [
            'other_cookie=value',
            'refresh_token=abc123',
            'session=xyz; refresh_token=abc',
            'id_tokens=fake', // similar name but not exact
            'xid_token=fake', // similar name but not exact
        ];
        testCases.forEach((cookieHeader) => {
            it(`should return undefined for: ${cookieHeader}`, () => {
                expect(getIdTokenFromCookies(cookieHeader)).toBeUndefined();
            });
        });
    });

    describe('extracts id_token correctly', () => {
        const testCases = [
            { cookie: 'id_token=abc123', expected: 'abc123' },
            { cookie: 'id_token=abc123; other=value', expected: 'abc123' },
            { cookie: 'other=value; id_token=abc123', expected: 'abc123' },
            { cookie: 'a=1; id_token=abc123; b=2', expected: 'abc123' },
            { cookie: '  id_token=abc123  ', expected: 'abc123' },
            { cookie: 'id_token=abc123;other=value', expected: 'abc123' }, // no space after semicolon
        ];
        testCases.forEach(({ cookie, expected }) => {
            it(`should extract token from: ${cookie}`, () => {
                expect(getIdTokenFromCookies(cookie)).toBe(expected);
            });
        });
    });

    describe('handles URL-encoded tokens', () => {
        it('should decode URL-encoded token value', () => {
            const encodedToken = encodeURIComponent('token+with/special=chars');
            expect(getIdTokenFromCookies(`id_token=${encodedToken}`)).toBe('token+with/special=chars');
        });
    });
});

describe('isAuthenticatedForReads', () => {
    describe('returns false when no token present', () => {
        const testCases = [
            { name: 'no headers', event: createMockEvent() },
            { name: 'empty cookie', event: createMockEvent('') },
            { name: 'other cookies only', event: createMockEvent('refresh_token=abc') },
        ];
        testCases.forEach(({ name, event }) => {
            it(`should return false for: ${name}`, () => {
                expect(isAuthenticatedForReads(event)).toBe(false);
            });
        });
    });

    describe('returns true when token present (no validation)', () => {
        const testCases = [
            { name: 'valid-looking token', event: createMockEvent('id_token=test-jwt-token-value') },
            { name: 'any token value', event: createMockEvent('id_token=literally-any-value') },
            { name: 'with other cookies', event: createMockEvent('other=value; id_token=abc123') },
        ];
        testCases.forEach(({ name, event }) => {
            it(`should return true for: ${name}`, () => {
                expect(isAuthenticatedForReads(event)).toBe(true);
            });
        });
    });
});

describe('ensureAuthorizedForWrites', () => {
    beforeEach(() => {
        // Reset verifier before each test
        setVerifierForTesting(undefined);
    });

    afterEach(() => {
        // Clean up
        setVerifierForTesting(undefined);
    });

    describe('throws UnauthorizedException when no token', () => {
        const testCases = [
            { name: 'no headers', event: createMockEvent() },
            { name: 'empty cookie', event: createMockEvent('') },
            { name: 'other cookies only', event: createMockEvent('refresh_token=abc') },
        ];
        testCases.forEach(({ name, event }) => {
            it(`should throw for: ${name}`, async () => {
                await expect(ensureAuthorizedForWrites(event)).rejects.toThrow(UnauthorizedException);
            });
        });
    });

    describe('throws UnauthorizedException when token validation fails', () => {
        it('should throw when verifier rejects token', async () => {
            // Mock verifier that always rejects
            setVerifierForTesting({
                verify: jest.fn().mockRejectedValue(new Error('Token expired')),
            });

            const event = createMockEvent('id_token=expired-token');
            await expect(ensureAuthorizedForWrites(event)).rejects.toThrow(UnauthorizedException);
        });

        it('should throw when verifier returns invalid signature', async () => {
            setVerifierForTesting({
                verify: jest.fn().mockRejectedValue(new Error('Invalid signature')),
            });

            const event = createMockEvent('id_token=invalid-signature-token');
            await expect(ensureAuthorizedForWrites(event)).rejects.toThrow(UnauthorizedException);
        });
    });

    describe('succeeds when token is valid', () => {
        it('should not throw when verifier accepts token', async () => {
            // Mock verifier that accepts the token
            setVerifierForTesting({
                verify: jest.fn().mockResolvedValue(mockPayload),
            });

            const event = createMockEvent('id_token=valid-token');
            await expect(ensureAuthorizedForWrites(event)).resolves.toBeUndefined();
        });

        it('should call verifier with the token from cookies', async () => {
            const mockVerify = jest.fn().mockResolvedValue(mockPayload);
            setVerifierForTesting({ verify: mockVerify });

            const event = createMockEvent('id_token=my-test-token');
            await ensureAuthorizedForWrites(event);

            expect(mockVerify).toHaveBeenCalledWith('my-test-token');
        });
    });
});

// Note: Tests for missing COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID env vars
// are not included here because:
// 1. The verifier is a module-level singleton, making it hard to test in isolation
// 2. Missing env vars would cause validateIdToken to catch the error and return undefined,
//    which results in an UnauthorizedException("Unauthorized") - the same as any other
//    validation failure. This is correct production behavior.
// 3. Missing env vars would be caught immediately during deployment/startup.
