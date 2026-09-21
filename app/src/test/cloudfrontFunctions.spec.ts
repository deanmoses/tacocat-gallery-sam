/**
 * Runs the inline CloudFront Functions in template.yaml against synthetic
 * viewer requests. cfn-lint, `sam build` and the change set all treat
 * FunctionCode as an opaque string, so this is where their logic is checked
 * before a deploy.
 *
 * Node runs the code, not the cloudfront-js-2.0 runtime, which accepts a
 * subset of JavaScript (no for...of, for one). A construct outside that
 * subset still surfaces only when CloudFront publishes the function, or via
 * `aws cloudfront test-function` against a deployed stage.
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const TEMPLATE_PATH = path.join(__dirname, '..', '..', '..', 'template.yaml');

interface ViewerRequest {
    method: string;
    uri: string;
    querystring: Record<string, { value: string }>;
    headers: Record<string, { value: string }>;
    cookies: Record<string, { value: string }>;
}

interface ViewerResponse {
    statusCode: number;
    statusDescription?: string;
    headers: Record<string, { value: string }>;
    body: string | { encoding: string; data: string };
}

type Handler = (event: { request: ViewerRequest }) => ViewerRequest | ViewerResponse;

/**
 * The FunctionCode block scalar of every AWS::CloudFront::Function resource,
 * keyed by logical ID, with the template line the code starts on.
 */
function extractFunctionCode(template: string): Map<string, { code: string; firstLine: number }> {
    const functions = new Map<string, { code: string; firstLine: number }>();
    const lines = template.split('\n');
    let resource = '';
    let keyIndent = -1;
    let contentIndent = -1;
    let code: string[] = [];
    let firstLine = 0;

    const finish = () => {
        if (keyIndent < 0) return;
        functions.set(resource, { code: code.join('\n'), firstLine });
        keyIndent = -1;
        contentIndent = -1;
        code = [];
    };

    lines.forEach((line, index) => {
        const indent = line.search(/\S|$/);
        if (keyIndent >= 0) {
            if (line.trim() === '') {
                code.push('');
                return;
            }
            if (indent <= keyIndent) {
                finish();
            } else {
                if (contentIndent < 0) contentIndent = indent;
                code.push(line.slice(contentIndent));
                return;
            }
        }
        const resourceMatch = /^ {2}(\w+):\s*$/.exec(line);
        if (resourceMatch) resource = resourceMatch[1];
        if (/^\s*FunctionCode:\s*\|[-+0-9]*\s*$/.test(line)) {
            keyIndent = indent;
            firstLine = index + 2; // 1-based, and the code starts on the next line
        }
    });
    finish();
    return functions;
}

const functions = extractFunctionCode(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

/** Compile a function's code and return its handler, reporting errors against template.yaml lines */
function load(logicalId: string): Handler {
    const fn = functions.get(logicalId);
    if (!fn) throw new Error(`No FunctionCode found for ${logicalId} in template.yaml`);
    const sandbox: { handler?: Handler } = {};
    vm.createContext(sandbox);
    new vm.Script(fn.code, { filename: 'template.yaml', lineOffset: fn.firstLine - 1 }).runInContext(sandbox);
    if (!sandbox.handler) throw new Error(`${logicalId} does not define handler()`);
    return sandbox.handler;
}

function request(uri: string, querystring: Record<string, string> = {}): ViewerRequest {
    return {
        method: 'GET',
        uri,
        querystring: Object.fromEntries(Object.entries(querystring).map(([key, value]) => [key, { value }])),
        headers: {},
        cookies: {},
    };
}

function asResponse(result: ViewerRequest | ViewerResponse): ViewerResponse {
    if (!('statusCode' in result)) throw new Error('Expected a response, got a request');
    return result;
}

function asRequest(result: ViewerRequest | ViewerResponse): ViewerRequest {
    if ('statusCode' in result) throw new Error(`Expected a request, got a ${result.statusCode} response`);
    return result;
}

/** The JSON error shape the API's handleHttpExceptions() also returns */
function errorMessage(response: ViewerResponse): string {
    if (typeof response.body !== 'string') throw new Error('Expected a string body');
    return (JSON.parse(response.body) as { errorMessage: string }).errorMessage;
}

test('every CloudFront Function in the template has tests here', () => {
    expect([...functions.keys()].sort()).toEqual([
        'DerivedImagesUrlRewriteFunction',
        'RobotsTxtFunction',
        'VideoPlaybackUrlRewriteFunction',
    ]);
});

describe('RobotsTxtFunction', () => {
    const handler = load('RobotsTxtFunction');

    it('serves robots.txt as text', () => {
        const response = asResponse(handler({ request: request('/robots.txt') }));
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type'].value).toBe('text/plain; charset=utf-8');
        const body = response.body as { encoding: string; data: string };
        expect(body.encoding).toBe('text');
        expect(typeof body.data).toBe('string');
    });

    it('allows crawling for everyone, then disallows the AI training bots', () => {
        const response = asResponse(handler({ request: request('/robots.txt') }));
        const body = (response.body as { data: string }).data;
        expect(body).toMatch(/^User-agent: \*\nAllow: \/\n\n(User-agent: [^\n]+\n)+Disallow: \/\n$/);
    });

    it('the bot list is sorted and free of duplicates', () => {
        const response = asResponse(handler({ request: request('/robots.txt') }));
        const body = (response.body as { data: string }).data;
        const bots = [...body.matchAll(/^User-agent: (?!\*)(.+)$/gm)].map((m) => m[1]);
        const sorted = [...bots].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        expect(bots).toEqual(sorted);
        expect(new Set(bots).size).toBe(bots.length);
    });

    it('passes any other request through untouched', () => {
        const original = request('/2001/12-31/');
        expect(handler({ request: original })).toBe(original);
    });
});

describe('VideoPlaybackUrlRewriteFunction', () => {
    const handler = load('VideoPlaybackUrlRewriteFunction');

    it('rewrites to the transcoded video under the derived images path', () => {
        const result = asRequest(handler({ request: request('/v/2024/06-15/video.mp4', { version: 'abc123' }) }));
        expect(result.uri).toBe('/i/2024/06-15/video.mp4/abc123/video-transcoded');
        expect(result.querystring).toEqual({});
    });

    it('rejects a request without a version', () => {
        const response = asResponse(handler({ request: request('/v/2024/06-15/video.mp4') }));
        expect(response.statusCode).toBe(400);
        expect(response.headers['content-type'].value).toBe('application/json');
        expect(errorMessage(response)).toBe('Missing Version');
    });
});

describe('DerivedImagesUrlRewriteFunction', () => {
    const handler = load('DerivedImagesUrlRewriteFunction');

    it('appends version and size to the path', () => {
        const result = asRequest(
            handler({ request: request('/i/2024/06-15/image.jpg', { version: 'abc123', size: '200x200' }) }),
        );
        expect(result.uri).toBe('/i/2024/06-15/image.jpg/abc123/200x200');
        expect(result.querystring).toEqual({});
    });

    it('appends the crop after the size', () => {
        const result = asRequest(
            handler({
                request: request('/i/2024/06-15/image.jpg', { version: 'abc123', size: '200x200', crop: '1,2,3,4' }),
            }),
        );
        expect(result.uri).toBe('/i/2024/06-15/image.jpg/abc123/200x200/crop=1,2,3,4');
    });

    it.each<{ name: string; querystring: Record<string, string>; error: string }>([
        { name: 'version', querystring: { size: '200x200' }, error: 'Missing Version' },
        { name: 'size', querystring: { version: 'abc123' }, error: 'Missing Size' },
    ])('rejects a request without a $name', ({ querystring, error }) => {
        const response = asResponse(handler({ request: request('/i/2024/06-15/image.jpg', querystring) }));
        expect(response.statusCode).toBe(400);
        expect(response.headers['content-type'].value).toBe('application/json');
        expect(errorMessage(response)).toBe(error);
    });
});
