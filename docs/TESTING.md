# Testing

> **Status:** Phase 0 skeleton. Real test suites land per phase.

## Test pyramid for Huddle

| Layer                 | Tool                     | Lives in                       | First added |
| --------------------- | ------------------------ | ------------------------------ | ----------- |
| Unit                  | Vitest                   | `packages/*/src/**/*.test.ts`  | Phase 1     |
| Schema / RLS contract | pgTAP or SQL assertions  | `supabase/tests/*.sql`         | Phase 1     |
| Edge Function         | Vitest + mocked Supabase | `supabase/functions/*/test.ts` | Phase 4     |
| Web E2E               | Playwright               | `apps/web/tests/e2e/*`         | Phase 2     |
| Mobile E2E            | Maestro                  | `apps/mobile/tests/maestro/*`  | Phase 2     |

## Running tests

```bash
pnpm test            # unit tests across the monorepo (Phase 1+)
pnpm --filter web test:e2e   # web E2E (Phase 2+)
```

## Phase 0 gates

Phase 0 has no application tests. The gates are:

- `pnpm format:check` passes
- `pnpm lint` passes
- `pnpm typecheck` passes
- `pnpm --filter web build` succeeds
- `pnpm --filter mobile typecheck` succeeds
- CI is green on a PR to `main`

## Cross-phase rule

Each new phase must run all prior phases' tests as part of its acceptance — regression is non-negotiable. CI enforces this automatically by running `turbo run test` across the whole graph.
