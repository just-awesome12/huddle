# Contributing

Conventions for working on Huddle. Even as a solo build, these conventions make future-you's life easier.

## Branches

- One branch per roadmap phase or feature
- Naming: `phase-N/short-description` during MVP build; `feat/...`, `fix/...`, `chore/...`, `docs/...` after MVP
- Merge to `main` only after CI is green

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>

<body>

<footer>
```

- `type`: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`
- `scope`: package or app (`web`, `mobile`, `api-client`, `db`, `ci`, …)
- Subject: imperative, lowercase, ≤ 72 chars

Examples:

```
chore(repo): initialize phase 0 monorepo scaffolding
feat(db): add ideas table with rls policies
fix(web): handle expired session on protected routes
```

## Pull request checklist

Before merge, every PR must satisfy:

- [ ] CI green (lint + typecheck + format + tests)
- [ ] Relevant docs updated (`SETUP.md`, `ARCHITECTURE.md`, `TROUBLESHOOTING.md`, etc.)
- [ ] No new `TODO` comments without a tracking note
- [ ] Roadmap checkboxes updated where applicable

## Code style

ESLint + Prettier are enforced. Don't argue style — run `pnpm format` and move on.

- No `any` outside narrow, justified cases (must be commented)
- No implicit untyped returns
- Prefer `type` over `interface` for object shapes unless declaration merging is needed
- Imports ordered: built-ins → external → workspace → relative

## Adding a new package

1. `mkdir packages/<name>/src`
2. Copy `package.json` from an existing simple package (`packages/core`) and rename
3. Add `tsconfig.json` extending `@huddle/config/tsconfig/base.json`
4. Add `eslint.config.mjs` re-exporting from `@huddle/config/eslint/base`
5. `pnpm install` from root
6. Update `docs/ARCHITECTURE.md` with what the package does and why it exists

## Adding a migration

Stub for Phase 1. Filled in when migrations begin.
