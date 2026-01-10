/**
 * Jest setup file for UNIT tests.
 *
 * All AWS calls are mocked in unit tests, but the AWS SDK still requires
 * credential and config values to be set during initialization. These dummy
 * values ensure tests can run in any environment without external config.
 */

// AWS SDK requires these even when all calls are mocked
process.env.AWS_REGION ??= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ??= 'no-such-id';
process.env.AWS_SECRET_ACCESS_KEY ??= 'no-such-key';

// Application configuration - all AWS calls are mocked so these don't need real values
process.env.GALLERY_ITEM_DDB_TABLE ??= 'no-such-table';
process.env.ORIGINAL_IMAGES_BUCKET ??= 'no-such-bucket';
process.env.DERIVED_IMAGES_BUCKET ??= 'no-such-bucket';
process.env.GALLERY_APP_DOMAIN ??= 'no-such-domain';
process.env.DERIVED_IMAGE_GENERATOR_DOMAIN ??= 'no-such-domain';

// Redis configuration
process.env.REDIS_HOST ??= 'no-such-host';
process.env.REDIS_WRITE_USERNAME ??= 'no-such-user';
process.env.REDIS_WRITE_PASSWORD ??= 'no-such-password';
process.env.REDIS_SEARCH_USERNAME ??= 'no-such-user';
process.env.REDIS_SEARCH_PASSWORD ??= 'no-such-password';
