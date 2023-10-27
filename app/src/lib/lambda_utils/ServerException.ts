/**
 * Exception that instructs the lambda function to return a 500
 *
 * @param message error message
 */
export class ServerException extends Error {
    __proto__ = Error;
    httpStatusCode = 500;

    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, ServerException.prototype);
    }
}
