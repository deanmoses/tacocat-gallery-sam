/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */
import type { Config } from 'jest';
import * as dotenv from 'dotenv';
import path from 'path';

const envFile = path.join(__dirname, '..', '.env.test');
dotenv.config({ path: envFile });

const baseConfig = {
    transform: { '^.+\\.ts?$': 'ts-jest' },
    clearMocks: true,
    setupFiles: ['dotenv/config'],
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
        },
        {
            ...baseConfig,
            displayName: 'integration',
            testMatch: ['<rootDir>/src/test/integration/**/*.spec.ts'],
        },
    ],
};

export default config;
