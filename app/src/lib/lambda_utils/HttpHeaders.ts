import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * Header lookup by name, whatever case the client sent it in.
 *
 * REST API proxy events keep the original casing, and that casing varies with
 * the hop: a browser on HTTP/2 sends `cookie`, while CloudFront speaks
 * HTTP/1.1 to the origin and sends `Cookie`.
 */
export function getHeader(event: APIGatewayProxyEvent, name: string): string | undefined {
    const headers = event.headers ?? {};
    const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
    return key === undefined ? undefined : (headers[key] ?? undefined);
}
