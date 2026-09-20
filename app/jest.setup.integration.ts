/**
 * Jest setup for the integration project. Runs in each suite's environment.
 *
 * Integration tests use real AWS and Redis resources. Credentials and config
 * come from environment variables: .env.integration-test locally, CI secrets
 * in GitHub Actions.
 */
import { closeRedis } from './src/test/integration/helpers/redis';

// A backstop only: waits on asynchronous processing carry their own deadlines in waitFor()
jest.setTimeout(60_000);

process.env.AWS_REGION ??= 'us-east-1';

afterAll(() => closeRedis());
