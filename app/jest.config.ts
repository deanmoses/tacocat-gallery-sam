/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */
import type { Config } from 'jest';
import * as dotenv from 'dotenv';
import path from 'path';

const envFile = path.join(process.cwd(), '..', '.env.integration-test');
dotenv.config({ path: envFile });

const baseConfig = {
    transform: { '^.+\\.(ts|js)$': 'ts-jest' },
    // mime v4+ is ESM-only; tell Jest to transform it instead of skipping
    transformIgnorePatterns: ['/node_modules/(?!(mime)/)'],
    clearMocks: true,
};

const config: Config = {
    collectCoverage: false,
    coverageDirectory: 'coverage',
    coverageProvider: 'v8',
    projects: [
        {
            ...baseConfig,
            displayName: 'unit',
            testMatch: ['<rootDir>/src/**/*.spec.ts'],
            testPathIgnorePatterns: ['/node_modules/', '/src/test/integration/'],
            setupFiles: ['<rootDir>/jest.setup.unit.ts'],
        },
        {
            ...baseConfig,
            displayName: 'integration',
            testMatch: ['<rootDir>/src/test/integration/**/*.spec.ts'],
            setupFiles: ['<rootDir>/jest.setup.integration.ts'],
        },
    ],
};

export default config;
