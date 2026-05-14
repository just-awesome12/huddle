// Root Prettier config.
//
// NOTE: The root package.json is not a workspace member, so it cannot
// resolve `@huddle/config`. Keep this config inlined. The shared
// preset at `packages/config/prettier/index.mjs` is identical and is
// used by individual packages that ARE workspace members.

/** @type {import('prettier').Config} */
export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  arrowParens: 'always',
  bracketSpacing: true,
  endOfLine: 'lf',
};
