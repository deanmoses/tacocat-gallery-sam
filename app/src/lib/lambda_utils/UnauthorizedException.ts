/**
 * Exception that instructs the lambda function to return a 401
 */
export class UnauthorizedException extends Error {
    __proto__ = Error;
    httpStatusCode = 401;

    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, UnauthorizedException.prototype);
    }
}
