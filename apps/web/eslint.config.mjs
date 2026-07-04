import globals from 'globals';
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
];
