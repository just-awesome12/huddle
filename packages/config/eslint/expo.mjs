import base from './base.mjs';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * ESLint preset for the Expo (React Native) app.
 *
 * Adjustments versus base:
 *   - `@typescript-eslint/no-require-imports` is OFF. Metro requires
 *     static `require()` calls for asset resolution; banning them is
 *     incompatible with idiomatic React Native.
 *   - `react/no-unescaped-entities` is OFF. The rule fires on every
 *     natural-language apostrophe ("don't", "you're"); the protection
 *     it offers isn't worth the noise for ordinary prose.
 *   - A separate config block adds Jest globals (`it`, `expect`, etc.)
 *     to test files under `__tests__/` and any `*.test.*` files.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  ...base,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.{js,ts,jsx,tsx}'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
];
