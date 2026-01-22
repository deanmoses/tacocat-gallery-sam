import { migrateDimensions, MigrateInput, MigrateResult } from './migrateDimensions';

/**
 * This was a one-time migration to validate and fix image dimensions in DynamoDB.
 *
 * Invoke this Lambda function directly from AWS Console or CLI with:
 * - { "mode": "diagnose" } - Read-only check of all images
 * - { "mode": "fix" } - Fix orientation dimension issues
 * - { "mode": "diagnose", "image": "/2024/01-15/photo.jpg" } - Check single image
 * - { "mode": "fix", "image": "/2024/01-15/photo.jpg" } - Fix single image
 * - { "mode": "fix", "startFrom": "/2024/01-15/photo.jpg" } - Resume from image
 *
 * There's no API Gateway API for this Lambda because it
 * takes longer than API Gateway's max timeout, 29 seconds.
 */
export const handler = async (event: MigrateInput): Promise<MigrateResult> => {
    return await migrateDimensions(event);
};
