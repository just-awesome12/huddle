# Architecture

> **Status:** skeleton only. Phase 1 will populate the data model, RLS philosophy, and auth flow sections.

## Monorepo layout

```
apps/web        — Next.js 16 App Router web app
apps/mobile     — Expo SDK 55 mobile app (iOS + Android)
packages/types       — shared TypeScript types
packages/validation  — shared Zod schemas
packages/api-client  — Supabase client wrapper, hooks (added in Phase 2)
packages/core        — pure business logic (no I/O, no framework)
packages/config      — ESLint, Prettier, tsconfig presets
supabase/       — DB migrations, Edge Functions, local config
```

## Why a monorepo

The two apps share data validation (Zod), DB types, API access patterns, and pure business logic. Duplicating those across two repos would violate DRY and cause drift. Turborepo gives us task graph + cache; pnpm workspaces give us shared deps with strict isolation.

## Why these packages

- `types` is generated from the Supabase schema in Phase 1; everything downstream depends on it being current.
- `validation` schemas are the **single source of truth** for what a valid payload looks like, on both client and server.
- `api-client` exists so apps never instantiate the Supabase client directly — that keeps auth-token handling, error mapping, and realtime subscription management in one place.
- `core` holds logic that doesn't depend on Supabase, React, or platform APIs (e.g., random pick, invite token format). Pure functions are easiest to test exhaustively.
- `config` enforces the same lint and TS rules everywhere with zero per-package drift.

## Decision log (ADR-lite)

Decisions made so far. Each entry: date, decision, alternatives considered, reasoning.

### 2026-05-13 — Use Supabase as backend, auth, storage, and realtime

- **Alternatives considered:** Firebase, custom Node + Postgres stack, AWS Amplify
- **Reasoning:** Postgres + RLS gives us declarative, database-enforced authorization, which is the strongest answer to the "no data leakage" requirement. Combining auth + storage + realtime in one service keeps the surface area small for a solo build.

### 2026-05-13 — Single TypeScript codebase via Expo + Next.js

- **Alternatives considered:** PWA-only, native (Swift + Kotlin)
- **Reasoning:** Solo build with a "no deadline" but "ship to all three platforms" requirement. Expo + Next.js shares Zod schemas, types, and business logic across all platforms.

### 2026-05-13 — Strict TypeScript without `exactOptionalPropertyTypes`

- **Decision:** Enable `strict`, `noImplicitAny`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`. Do NOT enable `exactOptionalPropertyTypes`.
- **Alternatives considered:** Full strict (including `exactOptionalPropertyTypes`); minimal strict.
- **Reasoning:** `exactOptionalPropertyTypes` is the most-fought TS setting and creates constant friction with third-party libraries that ship `T | undefined` instead of `T?`. The compatibility cost outweighs the marginal correctness gain for an app of this scope. Every other strict setting is on. We can revisit this in a year if/when libraries catch up.

### 2026-05-13 — Delegate unused-variable detection to ESLint

- **Decision:** Do NOT enable `noUnusedLocals` or `noUnusedParameters` in tsconfig. Use `@typescript-eslint/no-unused-vars` instead.
- **Reasoning:** ESLint supports `argsIgnorePattern: '^_'` (prefix to opt out), supports per-file overrides, and surfaces these as lint warnings rather than blocking the TS compiler. The compiler does type correctness; the linter does code hygiene.

### 2026-05-13 — Phase 0 uses ESLint `recommended`, not `recommendedTypeChecked`

- **Decision:** Use non-type-checked rules during Phase 0. Upgrade to `recommendedTypeChecked` in Phase 1.
- **Reasoning:** Type-checked rules require `parserOptions.project` or `projectService` configuration. The empty placeholder source files in Phase 0 gain nothing from typed linting, and the config introduces failure modes (e.g., `.mjs` config files not being in any tsconfig). We upgrade once real source files exist.

## To be added in Phase 1

- High-level topology diagram
- Data model and table relationships
- RLS policy summary
- Auth flow diagrams
- Trust boundary write-up
