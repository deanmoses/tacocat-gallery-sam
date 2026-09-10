// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';

export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    eslintConfigPrettier,
    eslintPluginPrettier,
    {
        ignores: ['**/node_modules/**', '**/.aws-sam/**'],
    },
    {
        // Type-aware rules need a TypeScript program. tsconfig.json lives in app/,
        // so point the project service at it explicitly -- ESLint's working
        // directory is the repo root.
        files: ['**/*.ts'],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        // Plain JS/MJS here is Node tooling (build scripts, config files), not Lambda
        // source, so it needs Node globals. TS files get theirs from @types/node.
        files: ['**/*.js', '**/*.mjs'],
        extends: [tseslint.configs.disableTypeChecked],
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        // Root-level .js config files (.prettierrc.js) are CommonJS, not ESM
        files: ['**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
        },
    },
    {
        rules: {
            'no-extra-boolean-cast': 'off',
        },
    },
    {
        // Type-aware rule severities. Scoped to TypeScript: applying them
        // globally would re-enable typed linting on the JS/MJS tooling above,
        // which has no TypeScript program behind it.
        files: ['**/*.ts'],
        rules: {
            // Type-aware rules that catch real defects: unhandled promises,
            // thrown non-Errors that lose their stack trace in CloudWatch,
            // and "[object Object]" landing in logs and Redis keys.
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/only-throw-error': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/no-base-to-string': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',

            // `any` leaking out of the AWS SDK and JSON.parse boundaries. Worth
            // seeing and worth chipping away at, but there is too much of it to
            // gate CI on today.
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
            '@typescript-eslint/require-await': 'warn',
            '@typescript-eslint/restrict-template-expressions': 'warn',
        },
    },
);
