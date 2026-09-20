/**
 * Every integration suite must work in a test year of its own: suite cleanup
 * wipes the whole year from DynamoDB and S3, so two suites sharing a year and
 * running in parallel wipe each other's fixtures. That is a flaky failure that
 * only shows in CI.
 */
import fs from 'fs';
import path from 'path';
import { TEST_YEARS } from './integration/helpers/testYears';

const integrationDir = path.join(__dirname, 'integration');
const suites = fs.readdirSync(integrationDir).filter((f) => f.endsWith('.spec.ts'));

test('no two suites own the same year', () => {
    const years = Object.values(TEST_YEARS);
    expect(new Set(years).size).toBe(years.length);
});

test('every registered year belongs to a suite that exists', () => {
    for (const suite of Object.keys(TEST_YEARS)) {
        expect(suites).toContain(`${suite}.spec.ts`);
    }
});

test.each(suites)('%s uses only its own year', (file) => {
    const suite = file.replace(/\.spec\.ts$/, '');
    const source = fs.readFileSync(path.join(integrationDir, file), 'utf8');
    const registryReferences = [...source.matchAll(/TEST_YEARS\.(\w+)/g)].map((m) => m[1]);
    expect(new Set(registryReferences)).toEqual(new Set(registryReferences.length ? [suite] : []));
    // Test years are registered, never spelled out in a suite
    expect(source.match(/'\/1[67]\d\d\//g)).toBeNull();
});
