import { APIGatewayProxyResult } from 'aws-lambda';
import { NotFoundException } from './NotFoundException';
import { BadRequestException } from './BadRequestException';

export function respondSuccessMessage(successMessage: string): APIGatewayProxyResult {
    return respondHttp({
        success: true,
        message: successMessage,
    });
}

/**
 * Create a 404 Not Found response
 */
export function respond404NotFound(message: string): APIGatewayProxyResult {
    return respondHttp({ message: !message ? 'Not Found' : message }, 404);
}

/**
 * Create  lambda function response to send the result to the API Gateway
 */
export function respondHttp(body: object, statusCode = 200): APIGatewayProxyResult {
    return {
        isBase64Encoded: false,
        statusCode: statusCode,
        body: JSON.stringify(body),
    };
}

/**
 * Turn the exception into a response of the format that
 * the API Gateway will understand.
 */
export function handleHttpExceptions(e: unknown): APIGatewayProxyResult {
    if (e instanceof BadRequestException) {
        return respondHttp({ errorMessage: e.message }, 400);
    } else if (e instanceof NotFoundException) {
        return respond404NotFound(e.message);
    } else {
        throw e;
    }
}
