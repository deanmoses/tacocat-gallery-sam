/**
 * The AlbumVersion CloudFront Function, run from the code inlined in
 * template.yaml against a fake KeyValueStore. cloudfront-js-2.0 is close
 * enough to Node for the logic; what the runtime rejects (for...of, say)
 * only surfaces when CloudFront publishes the function.
 */
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

type Header = { value: string };
type Request = {
    method: string;
    uri: string;
    querystring: Record<string, Header>;
    headers: Record<string, Header>;
    cookies: Record<string, Header>;
};
type Handler = (event: { request: Request; context: { requestId: string } }) => Promise<Request>;

const store = new Map<string, string>();
const handler = loadFunction('AlbumVersionFunction', {
    kvs: () => ({
        get: (key: string) => {
            const value = store.get(key);
            return value === undefined ? Promise.reject(new Error(`no such key ${key}`)) : Promise.resolve(value);
        },
    }),
});

function request(overrides: Partial<Request> = {}): Request {
    return { method: 'GET', uri: '/api/album/2001/12-31', querystring: {}, headers: {}, cookies: {}, ...overrides };
}

async function run(overrides: Partial<Request> = {}): Promise<Request> {
    return await handler({ request: request(overrides), context: { requestId: 'req-1' } });
}

beforeEach(() => {
    store.clear();
    store.set('content:/', 'root1');
    store.set('content:/2001/', 'year1');
    store.set('content:/2001/12-31/', 'day1');
});

test('keys an album on its own version', async () => {
    const r = await run();
    expect(r.headers['x-album-version']).toEqual({ value: 'day1' });
    expect(r.headers['x-has-token']).toEqual({ value: '0' });
    expect((await run({ uri: '/api/album/2001' })).headers['x-album-version']).toEqual({ value: 'year1' });
    expect((await run({ uri: '/api/album' })).headers['x-album-version']).toEqual({ value: 'root1' });
});

test('a trailing slash is the same album, and the same cache entry', async () => {
    const day = await run({ uri: '/api/album/2001/12-31/' });
    expect(day.headers['x-album-version']).toEqual({ value: 'day1' });
    expect(day.uri).toBe('/api/album/2001/12-31');
    const root = await run({ uri: '/api/album/' });
    expect(root.headers['x-album-version']).toEqual({ value: 'root1' });
    expect(root.uri).toBe('/api/album');
});

test('an album missing from the store gets no version', async () => {
    store.delete('content:/2001/12-31/');
    expect((await run()).headers['x-album-version']).toBeUndefined();
});

test('the auth cookie splits the cache, but only when it has a value', async () => {
    expect((await run({ cookies: { id_token: { value: 'jwt' } } })).headers['x-has-token']).toEqual({ value: '1' });
    // The origin treats id_token= as no token; so must the key, or an admin could be served a guest's response
    expect((await run({ cookies: { id_token: { value: '' } } })).headers['x-has-token']).toEqual({ value: '0' });
    expect((await run({ cookies: { other: { value: 'x' } } })).headers['x-has-token']).toEqual({ value: '0' });
});

test('viewer-supplied cache key headers are discarded', async () => {
    const headers = { 'x-album-version': { value: 'forged' }, 'x-has-token': { value: '1' } };
    const r = await run({ headers });
    expect(r.headers['x-album-version']).toEqual({ value: 'day1' });
    expect(r.headers['x-has-token']).toEqual({ value: '0' });
    const write = await run({ method: 'PATCH', headers: { ...headers } });
    expect(write.headers).toEqual({});
});

test('?fresh from a viewer with a cookie gets a version nothing else will ask for, and the query string is dropped', async () => {
    const r = await run({ querystring: { fresh: { value: '' } }, cookies: { id_token: { value: 'jwt' } } });
    expect(r.headers['x-album-version']).toEqual({ value: 'fresh-req-1' });
    expect(r.querystring).toEqual({});
});

// Anyone else could otherwise send every request past the cache to the origin
test('?fresh from a viewer without a cookie is ignored', async () => {
    const r = await run({ querystring: { fresh: { value: '' } } });
    expect(r.headers['x-album-version']).toEqual({ value: 'day1' });
    expect(r.querystring).toEqual({});
});

test('query strings never reach the cache key or the origin', async () => {
    const r = await run({ querystring: { utm: { value: 'x' } } });
    expect(r.querystring).toEqual({});
});

test('writes and non-album paths pass through untouched', async () => {
    const r = await run({ method: 'PUT', querystring: { keep: { value: 'me' } } });
    expect(r.headers).toEqual({});
    expect(r.querystring).toEqual({ keep: { value: 'me' } });
    const junk = await run({ uri: '/api/album/2001/13-01' });
    expect(junk.headers).toEqual({});
    const other = await run({ uri: '/api/album-thumb/2001/12-31' });
    expect(other.headers).toEqual({});
});

/** Extract a FunctionCode block from template.yaml and evaluate it with a stub `cloudfront` module */
function loadFunction(resourceName: string, cloudfront: object): Handler {
    const template = readFileSync(path.join(__dirname, '../../../template.yaml'), 'utf8').split('\n');
    const start = template.findIndex((line) => line.startsWith(`  ${resourceName}:`));
    if (start < 0) throw new Error(`No resource ${resourceName} in template.yaml`);
    const codeLine = template.findIndex((line, i) => i > start && /^\s+FunctionCode:\s*\|/.test(line));
    const indent = template[codeLine + 1].match(/^ */)![0].length;
    const code: string[] = [];
    for (let i = codeLine + 1; i < template.length; i++) {
        const line = template[i];
        if (line.trim() === '') continue;
        if (line.match(/^ */)![0].length < indent) break;
        code.push(line.substring(indent));
    }
    const source = code.join('\n').replace(/^import cf from 'cloudfront';$/m, 'const cf = __cloudfront;');
    const sandbox: { __cloudfront: object; __exports: { handler?: Handler } } = {
        __cloudfront: cloudfront,
        __exports: {},
    };
    vm.runInNewContext(`${source}\n__exports.handler = handler;`, sandbox);
    if (!sandbox.__exports.handler) throw new Error(`No handler in ${resourceName}`);
    return sandbox.__exports.handler;
}
