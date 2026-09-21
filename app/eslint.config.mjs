// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import jest from 'eslint-plugin-jest';

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
        // Every jest rule is on unless listed here, so a plugin upgrade turns its
        // new rules on too.
        files: ['**/*.spec.ts', 'app/jest.*.ts', 'app/src/test/**/*.ts'],
        extends: [jest.configs['flat/all']],
        rules: {
            // The jest rule of the same name knows `expect(obj.method)` is safe
            '@typescript-eslint/unbound-method': 'off',
            'jest/unbound-method': 'error',
            // The integration suites' waitFor* helpers poll and throw on timeout
            'jest/expect-expect': ['error', { assertFunctionNames: ['expect', 'waitFor*'] }],

            // Poor fits for these suites. Titles name their input, so they
            // start however the input does; a suite builds one input and
            // checks every field of the result; hooks reset the SDK mocks;
            // setup that is not a mock belongs at module level.
            'jest/prefer-lowercase-title': 'off',
            'jest/max-expects': 'off',
            'jest/prefer-expect-assertions': 'off',
            'jest/no-hooks': 'off',
            'jest/require-hook': 'off',
            'jest/require-top-level-describe': 'off',
            'jest/prefer-importing-jest-globals': 'off',

            // Suites narrow with if-and-throw and branch on their inputs;
            // neither rule has a fixer, so each site is a hand rewrite.
            'jest/no-conditional-in-test': 'off',
            'jest/prefer-ending-with-an-expect': 'off',
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

            // Both of these are at zero, so gate CI to keep them there.
            // restrict-template-expressions is the compile-time half of
            // no-base-to-string above: it catches the `unknown` and `never`
            // interpolations that only stringify badly once they run.
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/restrict-template-expressions': 'error',

            // `any` leaking out of the AWS SDK and JSON.parse boundaries. These
            // are all at zero, so gate CI to keep them there: cast at the
            // boundary to the type the projection or parse is known to produce.
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-argument': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-enum-comparison': 'error',

            // Writes the `import type` that tsconfig's verbatimModuleSyntax demands
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-import-type-side-effects': 'error',
            '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
            '@typescript-eslint/dot-notation': 'error',
        },
    },
);
