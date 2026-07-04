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
    // No hard-coded UI strings (CLAUDE.md): JSX text must come from next-intl
    // translation messages, not literal children. See messages/en.json + he.json.
    files: ['**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    plugins: { react },
    rules: {
      'react/jsx-no-literals': 'error',
    },
  },
];
