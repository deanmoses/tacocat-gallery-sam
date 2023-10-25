/**
 * Exception that instructs the lambda function to return a 404
 */
export class NotFoundException extends Error {
    __proto__ = Error;
    httpStatusCode = 404;

    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, NotFoundException.prototype);
    }
}
