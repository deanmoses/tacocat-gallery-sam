/** UUID v4 format regex */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a string is a valid UUID.
 *
 * @param uuid String to validate
 * @returns true if valid UUID format, false otherwise
 */
export function isValidUuid(uuid: string | undefined | null): boolean {
    if (!uuid) return false;
    return UUID_REGEX.test(uuid.trim());
}
