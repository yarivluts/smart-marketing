import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * Shared flat ESLint config for all GrowthOS packages.
 * Kept intentionally light so `turbo lint` stays green in CI while still
 * catching real problems. Type-aware rules are added per-package where useful.
 */
export default tseslint.config(
  {
    ignores: ['dist/**', '.next/**', 'node_modules/**', 'coverage/**', '.turbo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  prettier,
);
