import type { APIGatewayProxyEvent } from 'aws-lambda';
import { respond404NotFound, respondHttp } from './ApiGatewayResponseHelpers';

const event = {} as APIGatewayProxyEvent;

describe('respondHttp()', () => {
    it('carries the extra headers alongside the standard ones', () => {
        const response = respondHttp(event, { ok: true }, 200, { 'X-Auth-Status': 'valid' });

        expect(response.statusCode).toBe(200);
        expect(response.headers).toMatchObject({
            'X-Auth-Status': 'valid',
            'Access-Control-Allow-Credentials': 'true',
        });
    });

    it('lets the gallery app read the auth status across origins', () => {
        expect(respondHttp(event, {}).headers).toMatchObject({ 'Access-Control-Expose-Headers': 'X-Auth-Status' });
    });

    it('never lets an extra header override a standard one', () => {
        const response = respondHttp(event, {}, 200, { 'Access-Control-Allow-Origin': '*' });

        expect(response.headers?.['Access-Control-Allow-Origin']).not.toBe('*');
    });
});

describe('respond404NotFound()', () => {
    it('carries the extra headers', () => {
        const response = respond404NotFound(event, 'Album Not Found', { 'X-Auth-Status': 'invalid' });

        expect(response.statusCode).toBe(404);
        expect(response.headers).toMatchObject({ 'X-Auth-Status': 'invalid' });
    });
});
