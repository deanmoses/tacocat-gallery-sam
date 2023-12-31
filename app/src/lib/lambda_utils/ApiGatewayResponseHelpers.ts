import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { NotFoundException } from './NotFoundException';
import { BadRequestException } from './BadRequestException';
import { UnauthorizedException } from './UnauthorizedException';
import { ServerException } from './ServerException';
import { getGalleryAppDomain } from './Env';

/**
 * Create a 200 OK API Gateway lambda function response
 */
export function respondSuccessMessage(event: APIGatewayProxyEvent, successMessage: string): APIGatewayProxyResult {
    return respondHttp(event, {
        success: true,
        message: successMessage,
    });
}

/**
 * Create a 404 Not Found API Gateway lambda function response
 */
export function respond404NotFound(event: APIGatewayProxyEvent, message: string): APIGatewayProxyResult {
    return respondHttp(event, { message: !message ? 'Not Found' : message }, 404);
}

/**
 * Create an API Gateway lambda function response
 */
export function respondHttp(event: APIGatewayProxyEvent, body: object, statusCode = 200): APIGatewayProxyResult {
    return {
        isBase64Encoded: false,
        statusCode: statusCode,
        body: JSON.stringify(body),
        headers: {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'HEAD, GET, OPTIONS, POST, PUT, PATCH, DELETE',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Allow-Origin': `https://${getGalleryAppDomain()}`,
        },
    };
}

/**
 * Turn the exception into a lambda function response of the format that
 * the API Gateway will understand.
 */
export function handleHttpExceptions(event: APIGatewayProxyEvent, e: unknown): APIGatewayProxyResult {
    if (e instanceof BadRequestException) {
        return respondHttp(event, { errorMessage: e.message }, 400);
    } else if (e instanceof NotFoundException) {
        return respond404NotFound(event, e.message);
    } else if (e instanceof UnauthorizedException) {
        return respondHttp(event, { errorMessage: e.message }, 401);
    } else if (e instanceof ServerException) {
        return respondHttp(event, { errorMessage: e.message }, 500);
    } else {
        console.error('Unexpected exception', e);
        // If we let the API Gateway handle the exception, it won't
        // include the CORS headers and it'll look to the browser like
        // a CORS error.
        return respondHttp(event, { errorMessage: 'Server Error' }, 500);
    }
}
