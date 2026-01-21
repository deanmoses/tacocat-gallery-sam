import { isValidUuid } from './uuidUtils';

describe('isValidUuid', () => {
    describe('valid UUIDs', () => {
        test('accepts standard UUID v4', () => {
            expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        });

        test('accepts UUID with uppercase letters', () => {
            expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
        });

        test('accepts UUID with mixed case', () => {
            expect(isValidUuid('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
        });

        test('accepts UUID with leading/trailing whitespace', () => {
            expect(isValidUuid('  550e8400-e29b-41d4-a716-446655440000  ')).toBe(true);
        });
    });

    describe('invalid UUIDs', () => {
        test('rejects undefined', () => {
            expect(isValidUuid(undefined)).toBe(false);
        });

        test('rejects null', () => {
            expect(isValidUuid(null)).toBe(false);
        });

        test('rejects empty string', () => {
            expect(isValidUuid('')).toBe(false);
        });

        test('rejects whitespace-only string', () => {
            expect(isValidUuid('   ')).toBe(false);
        });

        test('rejects arbitrary string', () => {
            expect(isValidUuid('not-a-uuid')).toBe(false);
        });

        test('rejects partial UUID', () => {
            expect(isValidUuid('550e8400-e29b')).toBe(false);
        });

        test('rejects UUID missing hyphens', () => {
            expect(isValidUuid('550e8400e29b41d4a716446655440000')).toBe(false);
        });

        test('rejects UUID with wrong segment lengths', () => {
            expect(isValidUuid('550e840-e29b-41d4-a716-446655440000')).toBe(false);
        });

        test('rejects UUID with invalid characters', () => {
            expect(isValidUuid('550g8400-e29b-41d4-a716-446655440000')).toBe(false);
        });

        test('rejects UUID with extra segments', () => {
            expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000-extra')).toBe(false);
        });
    });
});
