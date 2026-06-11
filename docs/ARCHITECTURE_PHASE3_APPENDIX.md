# Architecture — Phase 3 Appendix: Groups & Membership

> Companion to `ARCHITECTURE.md`. Covers the Phase 3 (3.1–3.3) design:
> the shared groups data layer, the web UI, the mobile UI, the
> `create_group` RPC, and decision log D43–D47.

---

## 1. Overview

Phase 3 delivers group CRUD and membership management on both apps:

- list my groups, create a group, view detail (members + roles)
- admin: rename, delete, remove members
- member: leave (blocked at the DB if sole admin)

Authorization is enforced entirely by Phase 1's RLS policies and the
`enforce_last_admin` trigger. The UI hides controls by role, but that is
UX only — every destructive path is independently rejected by Postgres.

### Layering

```
                 packages/validation        Zod schemas (createGroupSchema, …)
                        │
                 packages/api-client
                 ┌──────┴───────────┐
                 /groups            /groups-hooks
                 raw functions      TanStack Query hooks
                 (framework-free)   (react-query)
                        │                  │
        ┌───────────────┘                  └──────────────┐
   apps/web                                          apps/mobile
   Server Components (reads)                         Screens use hooks;
   + Server Actions (mutations)                      QueryClientProvider
   — react-query never enters                        at root layout
     a server bundle
```

---

## 2. The `create_group` RPC (D45)

`INSERT INTO groups … RETURNING *` (PostgREST `insert().select()`) fails
with 42501 for a freshly created group: Postgres checks the RETURNING
row against the `groups` SELECT policy (`is_group_member`) **before**
the `handle_new_group` AFTER-trigger has inserted the creator's
membership row. A plain INSERT works, but then the client cannot learn
the new group's id without generating UUIDs client-side — which needs a
crypto polyfill on React Native.

Fix: `public.create_group(p_name text)` — SECURITY DEFINER, returns the
`groups` row, always uses `auth.uid()` as creator (stronger than the
table's WITH CHECK, which nominally accepts a caller-supplied
`created_by`). The name CHECK constraint, trim trigger, and membership
trigger all still apply inside the function. EXECUTE is granted to
`authenticated` only. Covered by `supabase/tests/create_group_rpc.sql`
(7 assertions).

The groups INSERT policy remains in place; direct inserts without
RETURNING are still legal.

---

## 3. Web data flow

- **Reads** happen in Server Components (`/groups`, `/groups/[id]`,
  `/groups/[id]/settings`) calling the raw functions with the
  cookie-bound server client. A non-member and a nonexistent group are
  indistinguishable under RLS — both render 404 (deliberate: no id
  oracle).
- **Mutations** are five Server Actions in `apps/web/src/actions/groups.ts`
  (extends D26/D29: `'use server'` file exports only async functions;
  shared state types live in `groups-state.ts`). Each action
  `revalidatePath`s what it touched.
- The `enforce_last_admin` trigger error (check_violation 23514 →
  HuddleError kind `validation`) is mapped to a friendly message in the
  leave/remove actions.
- Destructive actions use `ConfirmActionForm` — an inline two-step
  confirmation (not `window.confirm`), accessible and Playwright-testable.

## 4. Mobile data flow

- One `QueryClient` created in the root layout (inside `useState` so
  Fast Refresh doesn't share caches across reloads), wrapping
  `AuthProvider`/`GatedStack`.
- Screens consume `@huddle/api-client/groups-hooks`; mutations
  invalidate/remove the query keys from the shared
  `groupQueryKeys` factory.
- Routes mirror the web URL shape (`/groups`, `/groups/new`,
  `/groups/[id]`, `/groups/[id]/settings`) — see D46.
- `ConfirmAction` mirrors the web component. `Alert.alert` was rejected
  because multi-button alerts are a silent no-op on the Expo web
  preview, which is our only automated-adjacent mobile smoke path until
  Maestro (Phase 9).
- Inline errors only (D41 carryover); the sole-admin trigger error is
  mapped in `src/lib/group-errors.ts`.

---

## 5. Decision log D43–D47

| # | Decision | Rationale |
|---|---|---|
| D43 | Web Phase 3 reads use Server Components calling raw api-client functions; mutations use Server Actions. The TanStack Query hooks are for mobile (and future client components). | Extends D26. Keeps the web app server-authoritative and avoids shipping a client cache where the server already has the data. |
| D44 | `@huddle/api-client` splits `/groups` (framework-free raw functions) from `/groups-hooks` (react-query wrappers). | Importing react-query into a Next.js server bundle is at best fragile. The split makes it structurally impossible. Server code imports raw functions; clients import hooks. |
| D45 | Group creation goes through the `create_group` SECURITY DEFINER RPC. | `INSERT … RETURNING` is checked against the SELECT policy before the membership trigger runs (42501). RPC returns the row safely and forces `created_by = auth.uid()`. |
| D46 | Mobile screen routes mirror the web URL shape. | One mental model, and `huddle://groups/...` deep links (Phase 4 invites) resolve identically on both platforms. |
| D47 | `react` is pinned in api-client's devDependencies to mobile's version (19.2.0). | Without it, pnpm auto-resolves a phantom react peer for api-client's react-query devDep and builds a SECOND react-query instance; provider and hooks then use different React contexts → "No QueryClient set" crash at runtime. Same-version pinning collapses both to one `.pnpm` instance. |

---

## 6. Phase 3 gotchas (the bugs that only runtime caught)

Both were invisible to typecheck and lint; both were caught by actually
running the app (Playwright on web, Expo web preview smoke on mobile).

1. **tsconfig `paths` poisons Metro.** `apps/mobile/tsconfig.json` had
   `"react": ["./node_modules/@types/react"]` (a Phase 2.6 TS
   workaround). Expo's Metro resolves modules through tsconfig `paths`,
   so it tried to bundle the type-stubs package as the `react` module.
   Every mobile web bundle had been broken since 2.6 without anyone
   noticing, because nothing exercised the bundler between then and now.
   Lesson: tsconfig `paths` on mobile is part of RUNTIME resolution, not
   just the type system — and "typecheck green" says nothing about
   whether the app bundles.

2. **pnpm peer-instance duplication.** Same package + same version can
   still exist as two physical instances under pnpm when peers resolve
   differently per importer (`@tanstack+react-query@5.101.0_react@19.2.0`
   vs `…_react@19.2.4`). React-context-based libraries then break in
   ways that look like wiring mistakes ("No QueryClient set"). Diagnose
   with `require.resolve(pkg, { paths: [consumerA, consumerB] })`; fix
   by aligning the peer (D47).

### Verified vs. deferred (mobile)

- ✅ Full group CRUD loop verified in the Expo web preview against local
  Supabase (create → detail → sole-admin leave blocked → rename →
  delete).
- ⏸️ Native-device verification (SecureStore, real navigation stack
  behavior) still deferred to the emulator/dev-build item from Phase 2.
- ⏸️ Multi-member flows (admin removes member; removed member loses
  access live) need Phase 4 invites to put a second member in a group.
  The DB-level guarantees are covered by pgTAP (`group_members.sql`,
  `groups_membership.sql`); the UI paths exist but are unexercised.
