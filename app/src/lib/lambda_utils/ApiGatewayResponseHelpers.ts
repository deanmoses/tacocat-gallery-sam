import { APIGatewayProxyResult } from 'aws-lambda';
import { NotFoundException } from './NotFoundException';
import { BadRequestException } from './BadRequestException';
import { ServerException } from './ServerException';

/**
 * Create a 200 OK API Gateway lambda function response
 */
export function respondSuccessMessage(successMessage: string): APIGatewayProxyResult {
    return respondHttp({
        success: true,
        message: successMessage,
    });
}

/**
 * Create a 404 Not Found API Gateway lambda function response
 */
export function respond404NotFound(message: string): APIGatewayProxyResult {
    return respondHttp({ message: !message ? 'Not Found' : message }, 404);
}

/**
 * Create an API Gateway lambda function response
 */
export function respondHttp(body: object, statusCode = 200): APIGatewayProxyResult {
    return {
        isBase64Encoded: false,
        statusCode: statusCode,
        body: JSON.stringify(body),
    };
}

/**
 * Turn the exception into a lambda function response of the format that
 * the API Gateway will understand.
 */
export function handleHttpExceptions(e: unknown): APIGatewayProxyResult {
    if (e instanceof BadRequestException) {
        return respondHttp({ errorMessage: e.message }, 400);
    } else if (e instanceof NotFoundException) {
        return respond404NotFound(e.message);
    } else if (e instanceof ServerException) {
        return respondHttp({ errorMessage: e.message }, 500);
    }
    throw e;
}
