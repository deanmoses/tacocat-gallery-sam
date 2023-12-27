/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */
import type { Config } from 'jest';
import * as dotenv from 'dotenv';
import path from 'path';

const envFile = path.join(__dirname, '..', '.env.test');
dotenv.config({ path: envFile });

const config: Config = {
    transform: {
        '^.+\\.ts?$': 'ts-jest',
    },
    clearMocks: true,
    collectCoverage: false,
    coverageDirectory: 'coverage',
    coverageProvider: 'v8',
    testMatch: ['**/*.spec.ts'],
    setupFiles: ['dotenv/config'],
};

export default config;
