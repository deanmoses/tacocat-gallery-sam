/**
 * Jest setup file for INTEGRATION tests.
 *
 * Integration tests use real AWS and Redis resources. Credentials and config
 * should be provided via environment variables (from .env.integration-test
 * locally, or CI secrets in GitHub Actions).
 */

// Increase default timeout for integration tests (AWS operations can be slow)
jest.setTimeout(30000);

process.env.AWS_REGION ??= 'us-east-1';
