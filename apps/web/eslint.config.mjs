import globals from 'globals';
import react from 'eslint-plugin-react';
import base from '@growthos/eslint-config/base';

export default [
  ...base,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        React: 'readonly',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    plugins: { react },
    rules: {
      'react/jsx-no-literals': 'off',
    },
  },
];
