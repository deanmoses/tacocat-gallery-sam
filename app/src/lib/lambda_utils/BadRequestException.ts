/**
 * Exception that instructs the lambda function to return a 400
 *
 * @param message error message
 */
export class BadRequestException extends Error {
    __proto__ = Error;
    httpStatusCode = 400;

    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, BadRequestException.prototype);
    }
}
