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
        // new rules on too. Off: the rule fights how the suites are written.
        files: ['**/*.spec.ts', 'app/jest.*.ts', 'app/src/test/**/*.ts'],
        extends: [jest.configs['flat/all']],
        rules: {
            // The jest rule of the same name knows `expect(obj.method)` is safe
            '@typescript-eslint/unbound-method': 'off',
            'jest/unbound-method': 'error',

            // Both `it` and `test` are in use
            'jest/consistent-test-it': 'off',
            // Hooks reset the SDK mocks
            'jest/no-hooks': 'off',
            'jest/require-hook': 'off',
            'jest/require-top-level-describe': 'off',
            // Titles name the input, so many start with a capital
            'jest/prefer-lowercase-title': 'off',
            // Suites build one input and check every field of the result
            'jest/max-expects': 'off',
            'jest/no-conditional-in-test': 'off',
            'jest/prefer-ending-with-an-expect': 'off',
            'jest/prefer-expect-assertions': 'off',
            'jest/prefer-importing-jest-globals': 'off',
            'jest/prefer-strict-equal': 'off',
            'jest/prefer-to-be': 'off',
            'jest/prefer-to-have-length': 'off',
            // Blank-line placement: Prettier territory
            'jest/padding-around-all': 'off',
            'jest/padding-around-after-each-blocks': 'off',
            'jest/padding-around-before-each-blocks': 'off',
            'jest/padding-around-expect-groups': 'off',
            'jest/padding-around-test-blocks': 'off',

            // Each of these is switched on by its own commit
            'jest/expect-expect': 'off',
            'jest/no-conditional-expect': 'off',
            'jest/no-unnecessary-assertion': 'off',
            'jest/prefer-called-with': 'off',
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
        },
    },
);
