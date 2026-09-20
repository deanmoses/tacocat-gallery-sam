# Integration tests

These suites run the gallery library against the real test stack: DynamoDB, S3, the processing Lambdas, CloudFront and Redis. See the project README for how to deploy the test stack and run them.

## Shape of a suite

A suite is one scenario told in steps. Fixtures are expensive here (an upload waits on a Lambda), so tests share them rather than each building their own. To keep that safe, a test never mutates state that a later test depends on. Each mutation under test lives in the `beforeAll` of a `describe` block, and the tests inside that block observe its results. A test may still mutate when nothing downstream relies on it, such as asserting that a rename to an existing name rejects.

```typescript
describe('after renaming the album', () => {
    beforeAll(() => renameAlbum(oldAlbumPath, newAlbumName));

    test('the old album is gone', ...);
    test('the new album holds the images', ...);
});
```

This makes the dependency structural rather than positional, lets `test.only` work on a single observation (Jest still runs the enclosing hooks), and attributes a failed mutation to the hook instead of to five downstream tests. Blocks still run in declaration order, so the integration project must never run with `--randomize`. Module-level `let` variables assigned in hooks are how fixture data passes between phases.

Use `assert` from `node:assert/strict` where a value has to exist before the test can go on. It narrows the type, which `expect(x).toBeDefined()` does not, and Jest reports it as an ordinary failure.

## Test years

Each suite works in a year album of its own, registered in `helpers/testYears.ts` under the suite's file name. Suite setup and teardown wipe that whole year from DynamoDB and S3, so a shared year would let parallel suites destroy each other's fixtures. `integrationTestYears.spec.ts` (a unit test) enforces the registry. The latest-album suite is the exception: it has to work in today's album, so it cleans up only that album.

## Waiting on asynchronous processing

S3 events, Lambda invocations and DynamoDB Streams give a test nothing to await, so tests poll for the effect with `waitFor()` and the helpers built on it. Every wait carries its own deadline; the Jest timeout in `jest.setup.integration.ts` is only a backstop.
