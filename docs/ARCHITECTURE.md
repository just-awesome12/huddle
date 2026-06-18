# Architecture

> **Status:** Phase 1 complete. Data model is fixed for MVP; Phase 2 begins implementing apps against it.

## Monorepo layout

```
apps/web        — Next.js 16 App Router web app
apps/mobile     — Expo SDK 55 mobile app (iOS + Android)
packages/types       — generated Database types + ergonomic helpers
packages/validation  — shared Zod schemas (Phase 2+)
packages/api-client  — Supabase client wrapper, hooks (Phase 2+)
packages/core        — pure business logic (Phase 4/7)
packages/config      — ESLint, Prettier, tsconfig presets
supabase/       — DB migrations, Edge Functions (Phase 4/7), local config, tests
```

## Why a monorepo

The two apps share data validation (Zod), DB types, API access patterns, and pure business logic. Duplicating those across two repos would violate DRY and cause drift. Turborepo gives us task graph + cache; pnpm workspaces give us shared deps with strict isolation.

## Why these packages

- `types` is generated from the Supabase schema and re-exported with helpers (`Tables<'ideas'>`, `Enums<'idea_status'>`); everything downstream depends on it being current.
- `validation` schemas are the **single source of truth** for what a valid payload looks like, on both client and server.
- `api-client` exists so apps never instantiate the Supabase client directly — that keeps auth-token handling, error mapping, and realtime subscription management in one place.
- `core` holds logic that doesn't depend on Supabase, React, or platform APIs (e.g., random pick, invite token format). Pure functions are easiest to test exhaustively.
- `config` enforces the same lint and TS rules everywhere with zero per-package drift.

## Data model

The MVP schema. Concrete DDL is in `supabase/migrations/*.sql`; RLS policies are described in the "RLS posture" subsection below.

### Tables

| Table                  | Purpose                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `public.profiles`      | 1:1 with `auth.users`. Public identity (username, display name, avatar).                |
| `public.groups`        | Unit of collaboration. Each group is created by a profile and has 1..N members.         |
| `public.group_members` | Junction (group_id, user_id, role). Role enum: `admin` or `member`. Composite PK.       |
| `public.group_invites` | Pending invitations. Token-based, expiring, single-use.                                 |
| `public.ideas`         | Proposed content within a group. Category + status enums. May reference a stored photo. |
| `public.decisions`     | Append-only history of picker runs. Each row records candidates and the chosen idea.    |
| `public.push_tokens`   | Expo push notification tokens, per user per device.                                     |

### Relationships

```
auth.users (Supabase)
   │  1:1
   ▼
public.profiles ─────────┐
   │ M:N via              │
   │ group_members        │
   ▼                      │
public.groups             │
   │                      │
   ├── group_invites ── (created_by, invited_user_id) → profiles
   │
   ├── ideas ── (proposed_by) ──────────────────────┐
   │                                                ▼
   └── decisions ── (run_by, chosen_idea_id, …) → profiles / ideas

storage.objects (bucket: idea-photos)
   path: {group_id}/{idea_id}/{filename}
   RLS via public.is_group_member(extract group_id from path)
```

All FK chains terminate at `auth.users(id)` with `ON DELETE CASCADE`, so deleting an auth user removes everything they touched.

### Enums

- `group_member_role` → `admin` | `member`
- `idea_category` → `food` | `activity` | `place` | `event` | `other`
- `idea_status` → `on_radar` | `done` | `dismissed`
- `push_platform` → `ios` | `android`

### Helper functions

Two SECURITY DEFINER, STABLE, plpgsql helpers used by every group-scoped RLS policy:

- `public.is_group_member(uuid) → boolean`
- `public.is_group_admin(uuid) → boolean`

Both check against `(select auth.uid())`. They never accept a "claimed identity" parameter — only the group_id to look up. Tested in `supabase/tests/*.sql`.

### Triggers

| Trigger                          | Table                  | Purpose                                                           |
| -------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| `on_auth_user_created`           | `auth.users`           | Auto-create `profiles` row with placeholder username `u_<12hex>`. |
| `profiles_lowercase_username`    | `public.profiles`      | Normalize username to lowercase.                                  |
| `profiles_set_updated_at`        | `public.profiles`      | Maintain `updated_at` (uses `clock_timestamp()`).                 |
| `groups_trim_name`               | `public.groups`        | Trim whitespace from name.                                        |
| `groups_set_updated_at`          | `public.groups`        | Maintain `updated_at`.                                            |
| `on_group_created`               | `public.groups`        | Auto-add creator as admin member.                                 |
| `enforce_last_admin_on_delete`   | `public.group_members` | Block deleting last admin (unless parent group is being deleted). |
| `enforce_last_admin_on_update`   | `public.group_members` | Block demoting last admin from `admin` to `member`.               |
| `group_invites_reject_if_member` | `public.group_invites` | Reject invite if `invited_user_id` is already a member.           |
| `ideas_trim_title`               | `public.ideas`         | Trim title.                                                       |
| `ideas_set_updated_at`           | `public.ideas`         | Maintain `updated_at`.                                            |

### Storage bucket

- `idea-photos` — private bucket, 10 MiB per file, allowed MIME types: `image/jpeg`, `image/png`, `image/webp`.
- Path convention: `{group_id}/{idea_id}/{filename}`. RLS extracts `group_id` from the first path segment and authorizes via `is_group_member`.

### RLS posture (summary)

Every table has RLS enabled. Operations not listed have **no policy** and are therefore denied.

| Table                                  | SELECT                          | INSERT                                     | UPDATE                                 | DELETE                                        |
| -------------------------------------- | ------------------------------- | ------------------------------------------ | -------------------------------------- | --------------------------------------------- |
| `profiles`                             | any authenticated               | (trigger only)                             | owner only                             | (cascade only)                                |
| `groups`                               | members                         | authenticated, `created_by = auth.uid()`   | admins                                 | admins                                        |
| `group_members`                        | members of same group           | (trigger / Edge Function only)             | admins (subject to last-admin trigger) | self or admin (subject to last-admin trigger) |
| `group_invites`                        | admins of group OR invited user | admins of group, `created_by = auth.uid()` | (Edge Function only)                   | admins of group                               |
| `ideas`                                | members                         | members, `proposed_by = auth.uid()`        | members                                | proposer or admin                             |
| `decisions`                            | members                         | (service role only)                        | (immutable)                            | (immutable, cascade only)                     |
| `push_tokens`                          | owner only                      | owner only                                 | owner only                             | owner only                                    |
| `storage.objects` (idea-photos bucket) | members of group folder         | members of group folder                    | members of group folder                | members of group folder                       |

## Decision log (ADR-lite)

Decisions made, in chronological order.

### 2026-05-13 — Use Supabase as backend, auth, storage, and realtime

- **Alternatives considered:** Firebase, custom Node + Postgres stack, AWS Amplify.
- **Reasoning:** Postgres + RLS gives us declarative, database-enforced authorization, which is the strongest answer to the "no data leakage" requirement. Combining auth + storage + realtime in one service keeps the surface area small for a solo build.

### 2026-05-13 — Single TypeScript codebase via Expo + Next.js

- **Alternatives considered:** PWA-only, native (Swift + Kotlin).
- **Reasoning:** Solo build with no deadline but ship-to-all-three-platforms requirement. Expo + Next.js shares Zod schemas, types, and business logic across all platforms.

### 2026-05-13 — Strict TypeScript without `exactOptionalPropertyTypes`

- **Decision:** Enable `strict`, `noImplicitAny`, `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`. Do NOT enable `exactOptionalPropertyTypes`.
- **Reasoning:** `exactOptionalPropertyTypes` creates constant friction with third-party libraries that ship `T | undefined` instead of `T?`. The compatibility cost outweighs the marginal correctness gain.

### 2026-05-13 — Delegate unused-variable detection to ESLint

- **Decision:** Do NOT enable `noUnusedLocals` or `noUnusedParameters` in tsconfig. Use `@typescript-eslint/no-unused-vars` instead.
- **Reasoning:** ESLint supports `argsIgnorePattern: '^_'`, supports per-file overrides, and surfaces these as lint warnings rather than blocking the TS compiler.

### 2026-05-13 — Phase 0 uses ESLint `recommended`, not `recommendedTypeChecked`

- **Decision:** Use non-type-checked rules during Phase 0. Upgrade to `recommendedTypeChecked` in Phase 1 once real source files exist.
- **Reasoning:** Type-checked rules require `parserOptions.project` configuration that's incompatible with empty placeholder files.

### 2026-05-13 — Per-app ESLint adjustments for React Native idioms

- **Decision:** In the Expo preset, disable `@typescript-eslint/no-require-imports` and `react/no-unescaped-entities`; add Jest globals for test files.
- **Reasoning:** Metro bundler requires static `require()` calls. The unescaped-entities rule fires on every apostrophe in natural-language text.

### 2026-05-13 — Profiles publicly readable to authenticated users

- **Decision:** RLS allows any authenticated user to SELECT any profile.
- **Reasoning:** Usernames and display names appear in every ideas list, member roster, and invite UI. Membership-scoped reads would require N+1 lookups. The auth wall (no anonymous access) prevents scraping; usernames carry no sensitive payload.

### 2026-05-13 — Placeholder usernames on signup

- **Decision:** Auto-create profile rows with `u_<12hex>` placeholder username, replaced in onboarding.
- **Reasoning:** Email-derived usernames leak the email local part and cause collisions. Blocking signup until username is chosen breaks OAuth flows.

### 2026-05-13 — Use `clock_timestamp()` for `updated_at` triggers

- **Decision:** `set_updated_at` uses `clock_timestamp()`, not `now()` / `CURRENT_TIMESTAMP`.
- **Reasoning:** `now()` returns transaction-start time and is identical across all calls within one transaction. Two columns updated in the same request would land with identical `updated_at` values, defeating the point.

### 2026-05-13 — Helper functions use `language plpgsql`, not `language sql`

- **Decision:** `is_group_member` and `is_group_admin` are plpgsql functions.
- **Reasoning:** `language sql` functions are validated at CREATE time; their body references must resolve immediately. plpgsql defers resolution to first call, letting us create the helpers BEFORE `group_members` exists. (Both languages disable inlining when `SECURITY DEFINER` is set, so no perf cost.)

### 2026-05-13 — Last-admin trigger checks for parent-group existence

- **Decision:** The `enforce_last_admin` trigger first checks whether the parent `groups` row still exists. If it doesn't (cascade scenario), the trigger no-ops.
- **Reasoning:** Postgres `ON DELETE CASCADE` fires `BEFORE DELETE` triggers on child rows. Without this check, deleting a group would be blocked by its own admin row.

### 2026-05-13 — Plaintext invite tokens at rest

- **Decision:** Store `group_invites.token` as plaintext (not hashed).
- **Reasoning:** Tokens are short-lived (7-day default), single-use, revocable, and individually low-value. Hashing would prevent showing the admin the full shareable URL after creation, which is a UX cost without proportional security gain.

### 2026-05-13 — Decisions are append-only

- **Decision:** `decisions` table has no UPDATE policy and no DELETE policy for any role. INSERT happens only via the picker Edge Function (service role).
- **Reasoning:** History view trustworthiness depends on immutability. A client who could edit a decision could rewrite history.

### 2026-05-13 — Ideas: trust the group, simplify field-level access

- **Decision:** Any group member can UPDATE any field on an idea. DELETE is restricted to proposer or admin.
- **Alternatives considered:** Restrict non-status field updates to proposer + admin via OLD/NEW comparison in WITH CHECK.
- **Reasoning:** The trust boundary is the group — members are presumed to behave reasonably toward each other's content. A clever RLS scheme to enforce "only the proposer can change the title" is complex, error-prone, and not justified by the threat model. If a member edits an idea unhelpfully, another member can edit it back.

### 2026-05-13 — Storage RLS via path-based authorization

- **Decision:** `idea-photos` objects use path `{group_id}/{idea_id}/{filename}`. Storage RLS extracts group_id from the path and feeds it to `is_group_member`.
- **Reasoning:** Avoids needing to look up the idea row to check its group. The path itself carries the authorization context.

### 2026-05-13 — Storage end-to-end tests deferred to Phase 5

- **Decision:** pgTAP tests verify the policy _expressions_ (`is_group_member(extract group_id from path)`) but not end-to-end `INSERT INTO storage.objects` because that table is owned by `supabase_storage_admin` and its production-safety triggers cannot be disabled by `postgres`.
- **Reasoning:** The pgTAP coverage proves that authorization decisions are correct for every (caller, path) combination. Wiring those decisions into PostgREST + storage.objects is end-to-end testable via `supabase-js` against a real Supabase instance in Phase 5.

### 2026-05-13 — Types are committed, not generated in CI

- **Decision:** `packages/types/src/database.ts` is generated locally and committed to the repo.
- **Reasoning:** CI doesn't have a Postgres instance, so on-the-fly generation would require running Supabase in CI (slow and brittle). Committed types catch schema/code drift via TypeScript compilation, which is the right place to catch it. Contract: every migration PR also regenerates and commits the types.
