/**
 * Every integration suite must own a distinct test year. Suite cleanup calls
 * cleanUpAlbumAndParents(), which deletes every S3 object under the parent
 * year's prefix, so two suites sharing a year and running in parallel delete
 * each other's uploads. That is a flaky failure that only shows in CI.
 */
import fs from 'fs';
import path from 'path';

const integrationDir = path.join(__dirname, 'integration');

test('no two integration suites use the same test year', () => {
    const yearsByFile = new Map<string, Set<string>>();
    for (const file of fs.readdirSync(integrationDir).filter((f) => f.endsWith('.spec.ts'))) {
        const source = fs.readFileSync(path.join(integrationDir, file), 'utf8');
        const years = new Set([...source.matchAll(/'\/(1[67]\d\d)\//g)].map((m) => m[1]));
        yearsByFile.set(file, years);
    }
    const owners = new Map<string, string[]>();
    for (const [file, years] of yearsByFile) {
        for (const year of years) owners.set(year, [...(owners.get(year) ?? []), file]);
    }
    const shared = [...owners].filter(([, files]) => files.length > 1);
    expect(shared).toEqual([]);
});
