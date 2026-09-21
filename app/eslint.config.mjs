// @ts-check

import path from 'node:path';
import eslint from '@eslint/js';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import jest from 'eslint-plugin-jest';

// ESLint runs from the repo root, which is where .gitignore lives
const gitignorePath = path.resolve(import.meta.dirname, '..', '.gitignore');

export default defineConfig(
    // Everything git ignores here is generated or private -- SAM build output,
    // coverage, the .env files -- and none of it is in the tsconfig, so the
    // type-aware parser fails on anything it reaches. Deriving the list from
    // .gitignore keeps the two from drifting as new artifact directories appear.
    includeIgnoreFile(gitignorePath),
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    eslintConfigPrettier,
    eslintPluginPrettier,
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
        // Stale eslint-disable comments are themselves an error, so a suppression
        // can't outlive the problem it was added for
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
        rules: {
            'no-extra-boolean-cast': 'off',

            // Bug classes the type checker can't see
            'array-callback-return': 'error',
            'no-constructor-return': 'error',
            'no-self-compare': 'error',
            'no-template-curly-in-string': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-unreachable-loop': 'error',

            // Legacy JS constructs with better modern equivalents
            'default-case-last': 'error',
            'logical-assignment-operators': 'error',
            'no-lonely-if': 'error',
            'no-multi-assign': 'error',
            'no-new': 'error',
            'no-object-constructor': 'error',
            'no-sequences': 'error',
            'no-undef-init': 'error',
            'no-unneeded-ternary': 'error',
            'no-useless-concat': 'error',
            'no-useless-rename': 'error',
            'prefer-arrow-callback': 'error',
            'prefer-object-spread': 'error',
            'prefer-regex-literals': 'error',
            'symbol-description': 'error',

            // Footguns that should never appear
            'no-caller': 'error',
            'no-extend-native': 'error',
            'no-labels': 'error',
            'no-lone-blocks': 'error',
            'no-new-func': 'error',
            'no-new-wrappers': 'error',
            'no-proto': 'error',
            'no-script-url': 'error',
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
            // The compile-time half of no-base-to-string: catches the `unknown`
            // and `never` interpolations that only stringify badly once they run
            '@typescript-eslint/restrict-template-expressions': 'error',
            // An SDK's @deprecated tag is the only warning AWS gives before an
            // API it still ships stops working
            '@typescript-eslint/no-deprecated': 'error',

            // `any` leaking out of the AWS SDK and JSON.parse boundaries: cast at
            // the boundary to the type the projection or parse is known to produce
            '@typescript-eslint/no-unsafe-assignment': 'error',
            '@typescript-eslint/no-unsafe-argument': 'error',
            '@typescript-eslint/no-unsafe-member-access': 'error',
            '@typescript-eslint/no-unsafe-return': 'error',
            '@typescript-eslint/no-unsafe-call': 'error',
            '@typescript-eslint/no-unsafe-enum-comparison': 'error',

            // Async and runtime errors the checker can prove
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/no-misused-spread': 'error',
            '@typescript-eslint/no-mixed-enums': 'error',
            '@typescript-eslint/require-array-sort-compare': 'error',
            '@typescript-eslint/restrict-plus-operands': 'error',
            // Only the try/catch half: a promise returned from inside a try block
            // escapes the catch. Elsewhere `return await` is a matter of taste.
            '@typescript-eslint/return-await': ['error', 'error-handling-correctness-only'],
            // A `default` counts, so a switch that throws on the unexpected passes
            '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],

            // Type-level dead code and consistency
            '@typescript-eslint/adjacent-overload-signatures': 'error',
            '@typescript-eslint/array-type': 'error',
            '@typescript-eslint/ban-tslint-comment': 'error',
            '@typescript-eslint/consistent-type-assertions': 'error',
            '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
            '@typescript-eslint/consistent-type-exports': 'error',
            // Writes the `import type` that tsconfig's verbatimModuleSyntax demands
            '@typescript-eslint/consistent-type-imports': 'error',
            '@typescript-eslint/no-import-type-side-effects': 'error',
            '@typescript-eslint/default-param-last': 'error',
            '@typescript-eslint/no-confusing-non-null-assertion': 'error',
            '@typescript-eslint/no-empty-function': 'error',
            '@typescript-eslint/no-generated-empty-object-type': 'error',
            '@typescript-eslint/no-inferrable-types': 'error',
            '@typescript-eslint/no-invalid-void-type': 'error',
            '@typescript-eslint/no-loop-func': 'error',
            '@typescript-eslint/no-non-null-asserted-nullish-coalescing': 'error',
            '@typescript-eslint/no-non-null-assertion': 'error',
            '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
            '@typescript-eslint/no-unnecessary-qualifier': 'error',
            '@typescript-eslint/no-unnecessary-template-expression': 'error',
            '@typescript-eslint/no-unnecessary-type-arguments': 'error',
            '@typescript-eslint/no-unnecessary-type-parameters': 'error',
            '@typescript-eslint/no-useless-empty-export': 'error',
            '@typescript-eslint/prefer-enum-initializers': 'error',
            '@typescript-eslint/prefer-function-type': 'error',
            '@typescript-eslint/prefer-literal-enum-member': 'error',
            '@typescript-eslint/unified-signatures': 'error',
            // tsc's noUnusedParameters already lets a `_`-prefixed parameter through
            '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],

            // Modern stdlib usage
            '@typescript-eslint/dot-notation': 'error',
            '@typescript-eslint/prefer-find': 'error',
            '@typescript-eslint/prefer-for-of': 'error',
            '@typescript-eslint/prefer-includes': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error',
            '@typescript-eslint/prefer-reduce-type-parameter': 'error',
            '@typescript-eslint/prefer-string-starts-ends-with': 'error',
        },
    },
);
