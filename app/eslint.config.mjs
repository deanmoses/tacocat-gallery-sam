// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';

export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    eslintConfigPrettier,
    eslintPluginPrettier,
    {
        ignores: ['**/node_modules/**', '**/.aws-sam/**'],
    },
    {
        // Plain JS/MJS here is Node tooling (build scripts, config files), not Lambda
        // source, so it needs Node globals. TS files get theirs from @types/node.
        files: ['**/*.js', '**/*.mjs'],
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
);
