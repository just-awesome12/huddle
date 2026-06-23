# Powwow — Project Roadmap

<!-- Rebranded Huddle → Powwow (D105). "Huddle" / `@huddle/` below is the retained internal codename; the product is Powwow (powwow.co, co.powwow.app). -->

> **Status:** Phase 0 scaffolding generated; pending local validation by builder
> **Last updated:** 2026-05-13
> **Owner:** Solo build
> **Name:** Huddle (OQ-1 resolved) · **Bundle ID:** `com.huddleapp.huddle` (OQ-3 resolved)

---

## 1. Project Overview

A group-based idea-sharing app for the general public. Members of a group propose ideas for events, activities, food, and places. The group keeps a running history of what's been proposed, what's been done, and what's still on the radar. When the group can't reach consensus, a random picker chooses for them from the open shortlist.

The product runs as a **web app** (browser) and a **mobile app** (iOS + Android), sharing a single TypeScript codebase via a monorepo.

---

## 2. Confirmed Assumptions

These are decisions you have explicitly approved. Anything not in this list is still open and must not be assumed.

- [x] **Platforms:** Web (modern browsers), iOS, Android
- [x] **Languages:** TypeScript everywhere; JavaScript only where unavoidable (config files)
- [x] **Mobile strategy:** React Native + Expo (single TS codebase for iOS/Android)
- [x] **Web framework:** Next.js (App Router)
- [x] **Backend strategy:** Managed BaaS — Supabase (Postgres + Auth + RLS + Realtime + Storage)
- [x] **Authentication:** Email/password + Google OAuth + Apple OAuth (via Supabase Auth)
- [x] **Authorization model:** Postgres Row-Level Security (RLS) policies
- [x] **Content visibility:** Authenticated-only (no anonymous browsing)
- [x] **Anti-scraping:** Auth wall + Cloudflare in front of web + Turnstile on sign-up + standard robots.txt/ToS
- [x] **Real-time updates:** Supabase Realtime subscriptions
- [x] **Push notifications:** Expo Push Notifications, mobile only for v1
- [x] **Email notifications:** Deferred to v2
- [x] **Idea fields (MVP):** title, description, category, link, photo (optional), status, proposed_by, created_at
- [x] **Reactions/votes on ideas:** Deferred to v2
- [x] **Random picker behavior:** Picks from status="on_radar" ideas; optional category filter; optional "shortlist N" mode; result is recorded as a decision but does not auto-complete the idea
- [x] **Group membership:** Users can belong to multiple groups; creator is admin; admins can remove members and delete the group
- [x] **Group joining:** Invite link, email invite, and username search (all three)
- [x] **Team size:** Solo build
- [x] **Deadline:** None (steer toward free tiers and managed services)

---

## 3. Requirements

### 3.1 Functional Requirements

- [ ] FR-1: Users can sign up and sign in with email/password, Google, or Apple
- [ ] FR-2: Users have a profile (display name, username, avatar)
- [ ] FR-3: Users can create groups and invite others
- [ ] FR-4: Users can join groups via invite link, email invite, or username search
- [ ] FR-5: Users can belong to multiple groups
- [ ] FR-6: Group admins (creators) can rename groups, remove members, and delete groups
- [ ] FR-7: Group members can leave a group
- [ ] FR-8: Group members can post ideas with title, description, category, link, optional photo
- [ ] FR-9: Group members can change idea status: on_radar → done or dismissed
- [ ] FR-10: Group members can view full history of ideas in their group, filterable by status and category
- [ ] FR-11: A random picker can pick one idea from on_radar items, with optional category filter and optional shortlist
- [ ] FR-12: Picker results are stored as decision records visible in history
- [ ] FR-13: Updates to ideas, groups, and decisions appear in real time for connected members
- [ ] FR-14: Mobile users receive push notifications for: new idea in their group, picker ran, group invite received

### 3.2 Non-Functional Requirements

- [ ] NFR-1: **Security** — All data access enforced at the database layer via RLS. No client-side authorization checks are the sole guardrail.
- [ ] NFR-2: **Data isolation** — A user must not be able to read or modify any group/idea/decision belonging to a group they are not a member of, under any circumstances.
- [ ] NFR-3: **Anti-scraping** — All content is auth-gated; sign-up is Turnstile-protected; web traffic routed through Cloudflare with bot-fight enabled; rate limits applied to all mutating endpoints.
- [ ] NFR-4: **Auth secrets** — No raw passwords stored; OAuth tokens never exposed to client logs.
- [ ] NFR-5: **Uptime target** — 99.5% on the hosted services (success metric).
- [ ] NFR-6: **Task completion time** — A user can post an idea in ≤ 3 taps/clicks from the group view (success metric).
- [ ] NFR-7: **Accessibility** — Web meets WCAG 2.1 AA for forms, navigation, and color contrast.
- [ ] NFR-8: **Type safety** — `strict: true` TypeScript everywhere; no `any` outside narrow, justified exceptions.
- [ ] NFR-9: **Code quality** — DRY and SOLID applied; shared logic lives in packages, not duplicated per app.

---

## 4. Architecture Overview

### 4.1 High-Level Topology

```
                           ┌──────────────────────────┐
                           │   Cloudflare (proxy +    │
                           │   WAF + bot fight)       │
                           └────────────┬─────────────┘
                                        │
                           ┌────────────▼─────────────┐
                           │   Vercel (Next.js web)   │
                           └────────────┬─────────────┘
                                        │
   ┌────────────────────────────────────┼────────────────────────────────────┐
   │                                    │                                    │
┌──▼────────────┐                ┌──────▼────────┐                  ┌────────▼─────────┐
│ Expo / RN     │   HTTPS +      │  Supabase     │   Realtime WS    │  Expo Push       │
│ iOS + Android │◄──Realtime WS──┤  (Postgres,   │◄─────────────────┤  Notification    │
│ clients       │                │   Auth, RLS,  │                  │  Service         │
└───────────────┘                │   Storage)    │                  └──────────────────┘
                                 └───────────────┘
```

### 4.2 Trust Boundaries

- **Client (web + mobile):** untrusted. Performs UI rendering, optimistic updates, and forms validation only for UX. Never the authority on access.
- **Supabase Auth:** issues JWTs after successful authentication.
- **Postgres + RLS:** the **sole authority** on what data a JWT can read or write. Every table has explicit RLS policies. No service-role key is ever shipped to a client.
- **Edge Functions** (Supabase) where used: validate JWT, apply server-only logic (e.g., random picker shuffle, invite token generation), enforce rate limits.

### 4.3 Data Model (Logical)

Entities and key relationships (DDL specified in Phase 1):

- `profiles` (1:1 with `auth.users`) — public-facing user info
- `groups` — owned by a creator (admin)
- `group_members` — join table (`group_id`, `user_id`, `role`)
- `group_invites` — invite tokens (link-based, email-based)
- `ideas` — belong to a group, proposed by a profile, with status enum
- `decisions` — picker outcomes; link to one or more candidate ideas and one chosen idea
- `push_tokens` — Expo push tokens per user/device

### 4.4 Cross-Cutting Concerns

- **Validation:** Zod schemas in `packages/validation` are the single source of truth, imported by both web and mobile.
- **Types:** Generated from Supabase schema via `supabase gen types typescript`; re-exported from `packages/types`.
- **API access:** A thin wrapper around `@supabase/supabase-js` lives in `packages/api-client`. Apps never instantiate the Supabase client directly.
- **Feature flags / config:** `packages/config` exposes typed environment configuration.

---

## 5. Technology Stack

| Layer                          | Choice                                              | Reasoning                                               |
| ------------------------------ | --------------------------------------------------- | ------------------------------------------------------- |
| Monorepo                       | Turborepo + pnpm workspaces                         | Standard, fast, well-documented                         |
| Language                       | TypeScript (`strict`)                               | Required by you                                         |
| Web                            | Next.js 15 (App Router)                             | Hybrid SSR/CSR, mature, Vercel-first                    |
| Mobile                         | Expo SDK 52 + React Native 0.76                     | Single TS codebase, OTA updates, managed builds via EAS |
| Web styling                    | Tailwind CSS + shadcn/ui                            | Accessible, themable, fast to build                     |
| Mobile styling                 | NativeWind (Tailwind for RN)                        | Keeps styling vocabulary consistent with web            |
| State / data                   | TanStack Query + Supabase client                    | Cache + realtime invalidation                           |
| Forms                          | React Hook Form + Zod                               | Type-safe forms shared between apps                     |
| Validation                     | Zod                                                 | Shared between client and server                        |
| DB / Auth / Storage / Realtime | Supabase                                            | One service covers four needs                           |
| Auth providers                 | Email/password, Google, Apple                       | Per your spec                                           |
| Edge logic                     | Supabase Edge Functions (Deno)                      | For picker shuffle, invite tokens, rate limits          |
| Push notifications             | Expo Push Notifications + `expo-notifications`      | Free, integrated with mobile build                      |
| Anti-bot                       | Cloudflare proxy + Cloudflare Turnstile             | Free tier, low integration cost                         |
| CDN / proxy                    | Cloudflare (web)                                    | Bot fight, rate limiting, WAF                           |
| Hosting (web)                  | Vercel                                              | First-party Next.js host                                |
| Hosting (mobile)               | App Store + Google Play, builds via EAS             | Required for native deployment                          |
| CI/CD                          | GitHub Actions + EAS Build + Vercel Git integration | Standard                                                |
| Unit tests                     | Vitest                                              | Fast, ESM-native                                        |
| Web E2E                        | Playwright                                          | Best-in-class                                           |
| Mobile E2E                     | Maestro                                             | Simpler than Detox; YAML flows                          |
| Linting / formatting           | ESLint + Prettier (shared configs)                  | Standard                                                |
| Error monitoring               | Sentry (free tier)                                  | Web + mobile + edge functions                           |
| Analytics (post-MVP)           | PostHog or Plausible (deferred)                     | Will revisit when usage data matters                    |

---

## 6. Folder & File Structure

```
project-root/
├── apps/
│   ├── web/                       # Next.js 15 (App Router)
│   │   ├── app/
│   │   │   ├── (auth)/            # sign-in, sign-up routes
│   │   │   ├── (app)/             # authenticated app shell
│   │   │   │   ├── groups/
│   │   │   │   ├── ideas/
│   │   │   │   └── profile/
│   │   │   ├── api/               # route handlers (webhooks, callbacks)
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   ├── lib/
│   │   ├── public/
│   │   ├── tests/
│   │   │   └── e2e/               # Playwright
│   │   ├── next.config.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── mobile/                    # Expo
│       ├── app/                   # Expo Router file-based routes
│       │   ├── (auth)/
│       │   ├── (app)/
│       │   └── _layout.tsx
│       ├── components/
│       ├── lib/
│       ├── assets/
│       ├── tests/
│       │   └── maestro/           # Maestro flows
│       ├── app.config.ts
│       ├── eas.json
│       └── package.json
├── packages/
│   ├── types/                     # generated + hand-written shared types
│   ├── validation/                # Zod schemas
│   ├── api-client/                # Supabase client wrapper, hooks
│   ├── core/                      # business logic (picker, invite token utils)
│   ├── ui-logic/                  # shared headless hooks (no UI components, since web/native components don't render the same)
│   └── config/                    # eslint, tsconfig, prettier presets
├── supabase/
│   ├── migrations/                # SQL migrations, version-controlled
│   ├── functions/                 # Edge Functions (picker, invites, etc.)
│   ├── seed.sql
│   └── config.toml
├── docs/
│   ├── README.md
│   ├── SETUP.md
│   ├── ARCHITECTURE.md
│   ├── TESTING.md
│   ├── TROUBLESHOOTING.md
│   ├── SECURITY.md
│   └── CONTRIBUTING.md            # for future contributors / your future self
├── .github/
│   └── workflows/
│       ├── ci.yml                 # lint, type-check, unit, e2e web
│       ├── mobile-preview.yml     # EAS Build preview channel
│       └── release.yml
├── ROADMAP.md                     # this file
├── DOCUMENTATION_PLAN.md
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
└── .env.example
```

> **Note:** Folder structure may evolve as phases reveal new needs. Any change is documented in `ARCHITECTURE.md`.

---

## 7. Development Phases

> **Rule:** Each phase must be fully validated before the next begins. Every phase includes a **regression check** to confirm prior phases still work.

---

### Phase 0 — Foundation & Tooling

**Objective:** Stand up the monorepo, shared tooling, and a working Supabase project so we have a clean substrate to build on.

**Tasks**

- [ ] Initialize repo (`git init`, push to GitHub)
- [ ] Configure pnpm workspaces + Turborepo
- [ ] Create empty `apps/web` (Next.js 15, App Router, TS strict, Tailwind)
- [ ] Create empty `apps/mobile` (Expo SDK 52, Expo Router, TS strict, NativeWind)
- [ ] Scaffold `packages/config` with shared ESLint, Prettier, tsconfig
- [ ] Scaffold empty `packages/types`, `packages/validation`, `packages/api-client`, `packages/core`
- [ ] Create Supabase project (free tier); save URL + anon key + service-role key in a password manager
- [ ] Initialize `supabase/` directory locally; link to remote project
- [ ] Create `.env.example` and `.env.local` files (gitignored)
- [ ] Configure GitHub Actions: lint + type-check on every PR
- [ ] Configure Vercel project for `apps/web` (preview deployments per branch)
- [ ] Configure Sentry projects (web, mobile, edge) — install SDKs but don't enable yet

**Files likely affected**

- `package.json` (root), `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- `apps/web/*` (scaffold), `apps/mobile/*` (scaffold)
- `packages/config/*`, `packages/*/package.json`
- `.github/workflows/ci.yml`
- `supabase/config.toml`

**Implementation notes**

- Use `pnpm dlx create-next-app@latest --typescript --tailwind --eslint --app --src-dir=false --import-alias='@/*'` for web.
- Use `pnpm dlx create-expo-app@latest --template tabs` then strip down for mobile.
- Pin all package versions; no `^` ranges in root devDependencies.
- Don't write any feature code yet — this phase is _only_ substrate.

**Validation steps**

- [ ] `pnpm install` succeeds from a clean clone
- [ ] `pnpm -r build` (or `turbo run build`) succeeds across all packages and apps
- [ ] `pnpm -r lint` and `pnpm -r typecheck` pass
- [ ] Web dev server starts (`pnpm --filter web dev`) and renders default page
- [ ] Mobile dev server starts (`pnpm --filter mobile start`) and loads on Expo Go
- [ ] CI passes on a throwaway PR

**Tests that must pass**

- No app tests yet (no features). Gate is "all tooling green."

---

### Phase 1 — Database Schema & Row-Level Security Foundation

**Objective:** Define the entire MVP data model as migrations with strict RLS, plus generated TypeScript types. This phase is the security spine of the whole product — get it right before any UI.

**Tasks**

- [ ] Write migration: `profiles` table (id FK to `auth.users`, username unique, display_name, avatar_url, created_at)
- [ ] Write migration: `groups` table (id, name, created_by, created_at)
- [ ] Write migration: `group_members` table (group_id, user_id, role enum: 'admin'|'member', joined_at; PK composite)
- [ ] Write migration: `group_invites` table (id, group_id, token unique, email nullable, created_by, expires_at, accepted_by nullable, accepted_at nullable)
- [ ] Write migration: `ideas` table (id, group_id, proposed_by, title, description, category, link, photo_path nullable, status enum: 'on_radar'|'done'|'dismissed', created_at, updated_at)
- [ ] Write migration: `decisions` table (id, group_id, run_by, chosen_idea_id, candidate_idea_ids array, filters jsonb, created_at)
- [ ] Write migration: `push_tokens` table (user_id, expo_token, platform, last_seen_at)
- [ ] Enable RLS on every table; write explicit policies (see Implementation notes)
- [ ] Add database trigger: on `auth.users` insert, create empty `profiles` row
- [ ] Add database trigger: on `groups` insert, add creator as 'admin' in `group_members`
- [ ] Run `supabase gen types typescript --local > packages/types/src/database.ts`
- [ ] Re-export types from `packages/types`
- [ ] Write seed SQL with two test users, two groups, sample ideas (for local dev only)

**Files likely affected**

- `supabase/migrations/*.sql` (one per logical change, ordered)
- `supabase/seed.sql`
- `packages/types/src/database.ts` (generated)
- `packages/types/src/index.ts`

**Implementation notes**

- **RLS policy outline** (each implemented as `SELECT`, `INSERT`, `UPDATE`, `DELETE` rules):
  - `profiles`: any authenticated user can read; only owner can update.
  - `groups`: visible only to members. Insert allowed for any authenticated user. Update/delete only by admin members.
  - `group_members`: rows visible to other members of the same group. Insert only via accepted invite or via group creation trigger. Delete only by admin (removing someone) or self (leaving).
  - `group_invites`: visible to admins of the group, plus the invited email if applicable. Insert only by admins.
  - `ideas`: full CRUD visible only to members of the parent group. Insert by any member. Update of `status` by any member; update of other fields only by the proposer or an admin. Delete only by proposer or admin.
  - `decisions`: read-only for group members. Insert only via Edge Function (service role) to prevent client tampering with picker outcome.
  - `push_tokens`: read/write only by the owner user.
- All policies use helper SQL function `is_group_member(group_id uuid)` and `is_group_admin(group_id uuid)` to avoid duplication.
- Every migration is reversible (`up` and `down` if using a tool that supports it; otherwise document rollback steps in the migration file header).

**Validation steps**

- [ ] `supabase db reset` runs cleanly with all migrations + seed
- [ ] `packages/types/src/database.ts` regenerates without errors
- [ ] Manual SQL probe: as user A, attempt to `SELECT *` from group B's ideas → returns 0 rows
- [ ] Manual SQL probe: as user A, attempt to `INSERT` an idea into group B → fails with RLS violation
- [ ] Manual SQL probe: as non-admin member, attempt to `DELETE` a group → fails
- [ ] Trigger test: insert into `auth.users` (via Supabase Auth signup) → corresponding `profiles` row exists

**Tests that must pass before Phase 2**

- [ ] **Unit (SQL):** A test script (in `supabase/tests/`) using `pgTAP` or raw SQL assertions that exercises every RLS rule for every table with at least one positive and one negative case
- [ ] **Regression:** Phase 0 CI still green; type generation does not break any package build

---

### Phase 2 — Authentication ✅ COMPLETE

**Objective:** Working email/password and Google sign-in on both web and mobile, with auth-walled app shells. (Apple deferred — see status note.)

**Status (closed 2026-05-22):** Shipped across sub-phases 2.1–2.7. Email/password + Google OAuth work on web (fully verified, 16 Playwright tests) and mobile (verified in web preview; native OAuth + deep-link deferred). Apple OAuth deferred to a later phase. Full design captured in `docs/ARCHITECTURE.md` Phase 2 appendix (data flows, decision log D26–D42, mobile environment gotchas).

**What shipped vs. plan:**

- ✅ Google OAuth (web + mobile) — **Apple deferred** (needs Apple Developer account; revisit at launch prep / Phase 10)
- ✅ Web Turnstile implemented as a **Server Action verification**, not a standalone route handler (cleaner with the Server-Action-based auth; same security property)
- ⏸️ Native Google OAuth + `huddle://` deep-link verified by code review only — full device verification deferred (Expo Go was pinned to SDK 54 during the SDK 55 rollout; needs emulator or dev build)
- ⏸️ Mobile E2E (Maestro) deferred to Phase 9 per original plan

**Tasks**

- [x] Configure Google OAuth in Supabase Auth (`config.toml` + Google Cloud client); Apple deferred
- [x] Implement `packages/api-client` Supabase client factories (browser, server, service-role, native; shared interface)
- [x] **Web:** sign-up, sign-in, sign-out pages under `(auth)` route group
- [x] **Web:** proxy (Next 16's renamed middleware) redirects unauthenticated users to `/sign-in` for any `(app)` route
- [x] **Web:** OAuth callback handler (`/auth/callback`)
- [x] **Mobile:** sign-up, sign-in, sign-out screens under `(auth)` group
- [x] **Mobile:** root layout redirect based on auth state (`GatedStack` + `AuthProvider`)
- [x] **Mobile:** Google OAuth via `expo-auth-session`; Apple deferred
- [x] Implement Cloudflare Turnstile widget on web sign-up
- [x] Server-side Turnstile token verification (in the sign-up Server Action, via `@huddle/api-client/turnstile`)
- [x] Display name + username capture step (onboarding) for OAuth users (writes to `profiles`)

**Files likely affected**

- `packages/api-client/src/client.ts`, `client.native.ts`
- `apps/web/app/(auth)/**`, `apps/web/middleware.ts`, `apps/web/app/auth/callback/route.ts`
- `apps/mobile/app/(auth)/**`, `apps/mobile/app/_layout.tsx`
- `packages/validation/src/auth.ts` (Zod schemas for sign-up/sign-in)

**Implementation notes**

- Sign-up form fields: email, password, display name, username, Turnstile token. Validate username uniqueness via a unique constraint at the DB; surface 23505 errors as a friendly message.
- Apple Sign-In on web requires the "Sign in with Apple JS" SDK _or_ the OAuth flow — confirm which Supabase currently supports best at implementation time.
- Mobile: store session in `expo-secure-store`, not AsyncStorage.
- Do **not** persist OAuth tokens in plain logs (configure Sentry scrubbing).

**Validation steps**

- [x] Sign up via email/password on web → land on app shell → see own profile
- [x] Sign in with Google on web → same
- [ ] ~~Sign in with Apple on web~~ — deferred
- [x] Sign out on web → redirected to `/sign-in`
- [x] Email/password flows verified on mobile (web preview); ⏸️ native OAuth deferred to emulator/dev build
- [x] Hitting an `(app)` route while signed out redirects correctly (web proxy + mobile GatedStack)
- [x] Turnstile token rejected if forged → sign-up blocked (verified via unit tests; test-mode bypass documented)
- [x] Profile row exists after sign-up (Phase 1 `handle_new_user` trigger fires)

**Tests that must pass before Phase 3**

- [x] **Unit:** Zod schemas accept valid payloads and reject invalid ones (37 tests)
- [x] **Unit:** Turnstile verification helper handles success/failure responses (8 tests; 50 total in api-client)
- [x] **E2E (web, Playwright):** full sign-up + sign-in + sign-out happy path (16 tests)
- [ ] ~~**E2E (mobile, Maestro):** sign-in happy path~~ — deferred to Phase 9 per plan
- [x] **Regression:** Phase 1 RLS tests still pass (120 pgTAP assertions)

---

### Phase 3 — Groups & Membership ✅ COMPLETE (pending merge)

**Objective:** Users can create groups, view their groups, see members, leave groups, and (as admin) remove members or delete groups.

**Status (closed 2026-06-11):** Shipped in sub-phases 3.1 (shared data layer), 3.2 (web UI), 3.3 (mobile UI) on branch `phase-3-groups` (PR #1). Full design + decision log D43–D47 in `docs/ARCHITECTURE_PHASE3_APPENDIX.md`.

**What shipped vs. plan:**

- ✅ Zod schemas, raw data functions, and TanStack Query hooks — with a split: raw functions in `@huddle/api-client/groups` (used by web Server Components/Actions per D43), hooks in `/groups-hooks` (used by mobile)
- ✅ Web + mobile screens, role badges, admin-only controls, inline two-step confirmations
- ➕ **Unplanned migration:** `create_group` SECURITY DEFINER RPC — `INSERT…RETURNING` on groups is rejected by RLS before the membership trigger runs (D45)
- ⏸️ Multi-member UI flows (remove member, removed member loses access) cannot be exercised end-to-end until Phase 4 invites can add a second member; DB behavior covered by pgTAP

**Tasks**

- [x] Zod schemas for group create/update payloads in `packages/validation`
- [x] Hooks: `useMyGroups`, `useGroup(id)`, `useGroupMembers(id)`, `useCreateGroup`, `useUpdateGroup`, `useDeleteGroup`, `useLeaveGroup`, `useRemoveMember`
- [x] **Web:** `/groups` (list), `/groups/new`, `/groups/[id]` (detail), `/groups/[id]/settings`
- [x] **Mobile:** equivalent screens (routes mirror web URL shape, D46)
- [x] Member list with role badges; admin-only controls (remove, delete) gated by role check in UI **and** by RLS at DB
- [x] Confirmation dialogs for destructive actions (inline two-step, not native dialogs)

**Files likely affected**

- `packages/validation/src/groups.ts`
- `packages/api-client/src/groups.ts`
- `apps/web/app/(app)/groups/**`
- `apps/mobile/app/(app)/groups/**`

**Implementation notes**

- All hooks built on TanStack Query; mutations invalidate the relevant queries.
- Never trust the client's view of `role` — every destructive action will be rejected by RLS if the user isn't actually admin; UI hiding is purely UX.
- Group deletion cascades to members, ideas, decisions, invites (foreign keys with `ON DELETE CASCADE`, defined in Phase 1 migration — verify before this phase).

**Validation steps**

- [x] Create a group → appears in my list → I'm admin (web E2E + mobile smoke)
- [x] Second user (no membership) cannot see the group via API (pgTAP; web 404 path verified)
- [x] Admin can rename, member cannot (rename verified E2E; member-block by pgTAP)
- [~] Admin can remove a member; removed member loses access immediately — _DB layer verified by pgTAP; UI flow needs Phase 4 invites for a second member_
- [x] Member can leave; admin cannot leave if sole admin (friendly error verified on web E2E + mobile smoke)
- [x] Admin can delete; cascades remove all related rows (pgTAP cascade tests + E2E)

**Tests that must pass before Phase 4**

- [x] **Unit:** Group Zod schemas (12 tests; validation total 49)
- [x] **Integration:** Group data functions with mocked Supabase client (22 tests; api-client total 72) + `create_group` RPC pgTAP suite (7 assertions; pgTAP total 127)
- [x] **E2E (web):** 8 Playwright group tests (create, list, rename, sole-admin block, delete, cancel, 404)
- [x] **Regression:** All Phase 1 + Phase 2 tests still pass (24 Playwright total, 127 pgTAP)

---

### Phase 4 — Group Invitations ✅ COMPLETE (pending merge)

**Objective:** Three working invite paths — invite link, email invite (in-app, not actual email yet for v1 since email notifications are v2), and username search.

**Status (closed 2026-06-13):** Shipped in sub-phases 4.1 (RPCs + data layer), 4.2 (web UI + auth deep links), 4.3 (mobile UI + deep-link resume), 4.4 (username search + add-by-username) on branch `phase-4-invites` (PR #4). Full design + decision log D48–D51 in `docs/ARCHITECTURE_PHASE4_APPENDIX.md`.

**What shipped vs. plan:**

- 🔄 **No Edge Functions.** `accept_invite` + `peek_invite` are SECURITY DEFINER RPCs (D48, extends D45); `create_invite` needed nothing at all — Phase 1's column-default token generation + admin RLS INSERT…RETURNING already covered it. Edge Function infra debuts in Phase 7 (picker).
- 🔄 Tokens are generated **in Postgres** (Phase 1's `generate_invite_token()`); the planned `packages/core/invite-token.ts` never needed to exist.
- ➕ "Invites for you" section on the groups list (web + mobile) so addressed invites are discoverable — not in the original plan but required to complete the username-invite loop.
- ➕ Deep links survive the auth wall: web `?next=` round-trip (open-redirect-guarded), mobile pending-path stash in GatedStack (D49).
- ➕ Fixed a latent Phase 2 bug found by the 4.4 mobile smoke: supabase-js auth-callback deadlock (see appendix gotchas).
- ⚠️ v1 search rate limit is in-memory per-user in the route handler (D51); the perimeter limit is a Phase 9 Cloudflare item. Mobile searches Supabase directly — same Phase 9 item.

**Tasks**

- [x] ~~Edge Function:~~ `create_invite` — plain RLS INSERT with DB-generated token (no function needed)
- [x] ~~Edge Function:~~ `accept_invite` — SECURITY DEFINER RPC + `peek_invite` RPC (D48)
- [x] **Web/Mobile:** "Invite to group" UI: generate link button, copy-to-clipboard, QR code (mobile), share sheet (mobile), revoke list (both — OQ-10 resolved: yes, revocation via DELETE)
- [x] Username search: `/api/profiles/search?q=...` (Next.js route handler) with case-insensitive prefix match, capped at 10 results, rate-limited
- [x] "Add by username" flow that creates an invite addressed to a `user_id`
- [x] Accept-invite page (web) and deep link handler (mobile) for `/invites/[token]`

**Files likely affected**

- `supabase/functions/create-invite/index.ts`
- `supabase/functions/accept-invite/index.ts`
- `apps/web/app/(app)/groups/[id]/invite/page.tsx`
- `apps/web/app/invites/[token]/page.tsx`
- `apps/web/app/api/profiles/search/route.ts`
- `apps/mobile/app/(app)/groups/[id]/invite.tsx`
- `apps/mobile/app/invites/[token].tsx`
- `packages/core/src/invite-token.ts`

**Implementation notes**

- Tokens: 32 bytes from `crypto.randomBytes` (or `crypto.getRandomValues` in Edge), base64url-encoded. Stored only as the literal string (or a hash if you want defense-in-depth — decide at implementation).
- Default invite expiry: 7 days. Configurable later.
- Username search must enforce rate limit (10 req/min/user) to prevent enumeration.
- Deep links: use Expo's `scheme` and `expo-linking`.

**Validation steps**

- [x] Generate invite link → second user opens link signed-out → prompted to sign in → after auth, accept flow runs → they're a member (web E2E with ?next= round-trip; mobile smoke with pending-path resume)
- [x] Reused token (already accepted) → friendly error (E2E + pgTAP HD002)
- [~] Expired token → friendly error — _pgTAP-verified (HD001) + status-card unit path; not E2E'd end-to-end since default expiry is 7 days_
- [x] Username search returns matches; non-existent username returns empty (E2E)
- [x] Username search rate-limited after 10 rapid calls (E2E asserts the 11th request returns 429)
- [~] Mobile deep link `huddle://invites/<token>` opens accept screen — _path routing verified via Expo web preview (identical route mapping); real scheme-based open deferred with the other native-device items (Phase 10)_

**Tests that must pass before Phase 5**

- [x] **Unit:** ~~invite token generator~~ — token generation lives in Postgres (Phase 1); format enforced by CHECK constraint + pgTAP; client-side schemas tested (15 new validation tests, total 64)
- [x] **Integration:** ~~Edge Functions~~ — replaced by RPC pgTAP suite (17 assertions, total 144) + 24 new api-client tests (total 96)
- [x] **E2E (web):** two-browser tests — admin invites, second user accepts (link AND username paths); 8 new tests, total 32
- [x] **Regression:** prior phases green (32 Playwright, 144 pgTAP, 160 unit)

---

### Phase 5 — Ideas (CRUD + Photo Upload) ✅ COMPLETE (pending merge)

**Objective:** Group members can create, view, edit (limited fields), change status of, and delete ideas. Photos upload to Supabase Storage with RLS-protected access.

**Status (closed 2026-06-13):** Shipped in sub-phases 5.1 (data layer), 5.2 (web UI), 5.3 (web photos), 5.4 (mobile UI + photos) on branch `phase-5-ideas` (PR #6). Full design + decision log D52–D55 in `docs/ARCHITECTURE_PHASE5_APPENDIX.md`.

**What shipped vs. plan:**

- 🔄 **No migration needed.** Phase 1's `ideas` table, enums, constraints, triggers, RLS, and `idea-photos` bucket already covered the model — verified, not rebuilt.
- 🔄 **Edit permissions kept the Phase 1 model** (any member edits any field; UI gates controls to proposer/admin as UX). Decided as D52 — the roadmap's "RLS blocks non-proposers" expectation was the looser-than-planned Phase 1 reality.
- 🔄 **Hard delete** (D55), with manual storage-object cleanup since objects don't cascade. Phase 7 flag recorded: `decisions.chosen_idea_id` FK is `ON DELETE CASCADE` — revisit when the picker ships.
- ➕ OQ-5 resolved → report-and-review moderation policy (D53); report button deferred to Phase 10 store prep.
- ➕ Web photo upload via Server Actions + `bodySizeLimit: 4mb` (D54), keeping the no-browser-Supabase-client rule.
- ⏸️ Optimistic status updates and skeleton loaders not implemented — query invalidation + spinners were sufficient; revisit if latency shows.

**Tasks**

- [x] Zod schemas for idea create/update
- [x] Hooks: `useGroupIdeas(groupId, filters)`, `useCreateIdea`, `useUpdateIdea`, `useUpdateIdeaStatus`, `useDeleteIdea` (+ photo hooks)
- [x] ~~Supabase Storage bucket `idea-photos` with RLS~~ — already existed from Phase 1; verified against the path convention
- [x] **Web:** ideas list view per group with filters (status, category); create-idea form; idea detail; edit form (proposer/admin only in UI, D52)
- [x] **Mobile:** equivalents using native image picker (`expo-image-picker`)
- [x] Image compression before upload (max ~1MB, max 1920px long edge) using `browser-image-compression` (web) or `expo-image-manipulator` (mobile)
- [x] Empty states (skeleton loaders deferred — spinners used)

**Files likely affected**

- `packages/validation/src/ideas.ts`
- `packages/api-client/src/ideas.ts`
- `apps/web/app/(app)/groups/[id]/ideas/**`
- `apps/mobile/app/(app)/groups/[id]/ideas/**`
- `supabase/migrations/*storage*.sql` (RLS for storage)

**Implementation notes**

- Categories enum: `food`, `activity`, `place`, `event`, `other`. Defined in DB and mirrored in Zod.
- Photo path convention: `{group_id}/{idea_id}/{uuid}.{ext}` — encodes group_id so storage RLS can extract it.
- Optimistic updates for status changes (revert on error).
- The "history view" requirement (FR-10) is satisfied by the ideas list with filters — no separate history page needed.

**Validation steps**

- [x] Create idea with all fields → appears in list (web E2E + mobile smoke)
- [x] Upload photo → renders; non-member cannot fetch the photo URL even if guessed (web E2E: loading signed image + 400 on direct/public object fetch)
- [x] Filter by category → list updates (web E2E + mobile smoke)
- [x] Filter by status → list updates (web E2E + mobile smoke)
- [~] Non-proposer non-admin cannot edit title/description — _UI hides controls (E2E two-browser); RLS itself ALLOWS it per the Phase 1 model upheld in D52. Delete is RLS-blocked._
- [x] Any member can mark on_radar → done (web E2E two-browser proves a non-proposer member can change status)
- [x] Hard-delete chosen (D55); storage object cleaned up manually; Phase 7 FK-cascade flag recorded for `decisions.chosen_idea_id`

**Tests that must pass before Phase 6**

- [x] **Unit:** idea schema validations (13 new, total 77 validation)
- [x] **Integration:** photo upload + signed URL retrieval, replace/rollback, guessed-URL rejection (11 new api-client tests, total 121; + web E2E storage check)
- [x] **E2E (web):** create idea, upload photo, change status, filter, edit, delete, non-proposer gating (10 new tests, total 42)
- [x] **Regression:** all prior tests green (42 Playwright, 144 pgTAP, 198 unit)

---

### Phase 6 — Realtime ✅ COMPLETE (pending merge)

**Objective:** Changes to groups, ideas, and decisions appear in real time for all connected members without polling.

**Status (closed 2026-06-14):** Shipped in sub-phases 6.1 (publication + framework-free helper + R-4 verification), 6.2 (web provider), 6.3 (mobile provider) on branch `phase-6-realtime` (PR #9). Full design + decision log D56–D59 in `docs/ARCHITECTURE_PHASE6_APPENDIX.md`.

**What shipped vs. plan:**

- 🔄 **No `useRealtimeChannel` hook in api-client.** The shared piece is framework-free `subscribeToGroup` / `subscribeToMyGroups` (returns an unsubscribe); the react bindings live in the platform providers, because web and mobile invalidate differently (D57).
- 🔄 **Web does NOT invalidate a query cache** — it has none (RSC reads, D43). Events trigger a throttled `router.refresh()`. Only mobile invalidates TanStack Query.
- ➕ R-4 verified with an asserting two-user integration test (member receives, non-member does not); plain Postgres Changes is safe (D56) — no private-channel broadcast needed.
- ➕ Fixed the browser-env inlining bug (D59) surfaced by web's first client-side Supabase client.

**Tasks**

- [x] Enable Realtime publications for `groups`, `group_members`, `ideas`, `decisions` (migration 014, `REPLICA IDENTITY FULL`)
- [x] ~~`useRealtimeChannel` hook~~ → framework-free `subscribeToGroup`/`subscribeToMyGroups` in `@huddle/api-client/realtime` (D57)
- [x] Wire into caches: mobile invalidates TanStack Query; web runs throttled `router.refresh()` (RSC, no cache)
- [x] Connection-state dot on both apps
- [x] Reconnect-on-resume on mobile (`AppState` → reconnect + refetch)

**Files affected**

- `supabase/migrations/20260613120000_realtime_publication.sql`
- `packages/api-client/src/realtime.ts` (+ `client.browser.ts` env override)
- `apps/web/src/components/{RealtimeProvider,GroupRealtime,ConnectionDot}.tsx`, `apps/web/src/lib/supabase-browser.ts`
- `apps/mobile/src/context/RealtimeContext.tsx`, `apps/mobile/src/components/ConnectionDot.tsx`, `apps/mobile/src/lib/realtime-invalidate.ts`

**Validation steps**

- [x] Two browsers, same group: A adds idea → B sees it within ~1s (web E2E)
- [x] User B removed from group → B no longer receives events / loses access (web E2E: B's page goes 404 live; RLS integration test confirms non-member receives nothing)
- [~] Mobile backgrounded then resumed → reconnects + refetches — _code path verified; a real background/resume cycle needs a native device/emulator (Phase 10). The live-update path itself is preview-verified._

**Tests that must pass before Phase 7**

- [x] **Integration:** realtime subscription delivers events that match RLS scope (`realtime-rls.integration.mjs`, asserting)
- [x] **E2E (web):** two-context Playwright test verifying live update (3 new, total 45)
- [x] **Regression:** all prior tests green (45 Playwright, 144 pgTAP, 206 unit — 77 validation + 129 api-client incl. 8 realtime helper tests)

---

### Phase 7 — Random Picker & Decision History ✅ COMPLETE (pending PR)

**Objective:** A working "pick for us" feature that selects from on_radar ideas, supports filters and shortlist mode, and records every decision for history.

**Status (closed 2026-06-17):** Shipped in sub-phases 7.1 (FK migration + pure picker + `run_picker` Edge Function + decisions data layer), 7.2 (web picker UI + history), 7.3 (mobile picker UI + history) on branch `phase-7-picker`. Full design + decision log D60–D64 in `docs/ARCHITECTURE_PHASE7_APPENDIX.md`.

**What shipped vs. plan:**

- ➕ **First Edge Function** stood up: `run_picker` (Deno), with `[edge_runtime]` + `[functions.run_picker]` in `config.toml` and a `supabase/functions/_shared/` convention for shared code. Verified by a live integration probe (`run_picker.integration.mjs`, 9/9).
- 🔄 **FK is `ON DELETE NO ACTION`, not `RESTRICT`** (D61). NO ACTION blocks a direct chosen-idea delete (→ "dismiss instead") while still letting a group-delete cascade — RESTRICT would have aborted the cascade.
- 🔄 **Requires ≥2 candidates** (D63), diverging from the "1 candidate → that one is picked" validation step below — a one-option pick is meaningless. Returns `422 too_few_candidates`; clients disable the run button below the threshold.
- 🔄 **Web invokes via a Server Action** (not a client-side function call) to uphold the no-browser-Supabase rule (D64).
- ➕ Pure picker uses **rejection sampling** (unbiased) and a drift-guarded Deno mirror of `@huddle/core` (D62).
- 🔄 Routes are `/groups/[id]/picker` + `/groups/[id]/history` (dedicated pages, mirrored on mobile), not a `/pick` modal.

**Tasks**

- [x] Edge Function: `run_picker(group_id, options)` — validates membership, queries candidates respecting filters, performs cryptographically random pick (`crypto.getRandomValues`), inserts `decisions` row, returns chosen idea
- [x] Picker UI on web: options (category filter, optional "shortlist" toggle with idea multi-select), animated reveal
- [x] Picker UI on mobile: equivalent with native feel
- [x] Decisions list view per group ("History") showing past picks
- [x] Empty-state copy for when there are too few on_radar ideas

**Files likely affected**

- `supabase/functions/run-picker/index.ts`
- `packages/core/src/picker.ts` (pure shuffle logic, unit-testable)
- `apps/web/app/(app)/groups/[id]/pick/**`
- `apps/mobile/app/(app)/groups/[id]/pick.tsx`

**Implementation notes**

- The picker runs **server-side only** (Edge Function) so the result can't be re-rolled by a tampering client. The `decisions` table has RLS allowing INSERT only by `service_role`, enforced by the Edge Function using its secret key.
- Pure shuffle/pick logic lives in `packages/core/src/picker.ts` so it can be unit-tested without infrastructure. The Edge Function uses a drift-guarded Deno mirror (it can't import the pnpm workspace pkg) (D62).
- Animation: a ~1.4s JS-timer "spin" before reveal (no Reanimated dependency). Keep tasteful.

**Validation steps**

- [x] Picker with too few candidates → friendly empty state / disabled run, no decision recorded
- [~] ~~Picker with 1 candidate → that one is picked~~ → **changed to require ≥2** (D63): 1 candidate returns `too_few_candidates`; a one-option pick is meaningless
- [x] Picker pick is unbiased — `@huddle/core` uses rejection sampling; unit-tested (no modulo bias)
- [x] Picker with a shortlist → only those ideas are candidates (verified in the live probe + web E2E)
- [x] Decision appears in history with timestamp, run_by, candidates, chosen
- [x] Non-member cannot invoke the Edge Function for that group (→ 403, live probe)

**Tests that must pass before Phase 8**

- [x] **Unit:** picker logic (unbiased index, edge cases: empty, single, permutation; + Deno-mirror drift guard) — 10 in `@huddle/core`
- [x] **Integration:** live `run_picker` probe (`run_picker.integration.mjs`, 9/9) + api-client decisions unit tests (9)
- [x] **E2E (web):** run picker, see history entry; sub-2 filter disables run; chosen idea refuses hard-delete — `picker.spec.ts` (3)
- [x] **Regression:** prior phases green (typecheck 7, lint 6, Playwright 48, pgTAP 145)

---

### Phase 8 — Push Notifications (Mobile) ✅ COMPLETE (pending PR)

**Objective:** Mobile users receive push notifications for: new idea in their group, picker ran in their group, they were invited to a group.

**Status (closed 2026-06-17):** Shipped in sub-phases 8.1 (notification_prefs + pure logic + send-push Edge Function + data layer), 8.2 (pg_net Database Webhook triggers), 8.3 (mobile registration + prefs screen + deep links) on branch `phase-8-push` (stacked on Phase 7's `phase-7-picker` for the Edge Function infra). Full design + decision log D65–D69 in `docs/ARCHITECTURE_PHASE8_APPENDIX.md`.

**What shipped vs. plan:**

- ➕ **send-push** is the second Edge Function (webhook-authed, `verify_jwt` off); fan-out is **pg_net Database Webhook triggers** on all three tables — one seam covering every write path, not per-call-site invocation (D65).
- 🔄 **No 60s debounce/batching** — each INSERT fans out immediately. Acceptable for v1 volumes; revisit if noisy (appendix §4).
- 🔄 **Token cleanup is reactive**, not a marked-inactive flag: tokens are hard-removed on sign-out and pruned when Expo reports `DeviceNotRegistered`.
- ➕ A dry-run header makes send-push testable without hitting Expo (D67); pure selection logic + Deno mirror with a drift guard (D68).

**Tasks**

- [x] Request notification permissions on mobile (after sign-in, via NotificationsManager)
- [x] Register Expo push token; store in `push_tokens` (web-guarded; no-op without an EAS projectId)
- [x] Database triggers: on `ideas`/`decisions`/`group_invites` INSERT, fan out to send-push (excludes the actor)
- [x] Notification tap → deep link to the relevant screen (`data.path`)
- [x] In-app notification preferences screen (toggle each type)
- [x] Token cleanup: removed on sign-out; pruned on `DeviceNotRegistered`

**Files likely affected**

- `supabase/functions/send-push/index.ts`
- `supabase/migrations/*notification_prefs*.sql`
- `apps/mobile/lib/notifications.ts`
- `apps/mobile/app/(app)/settings/notifications.tsx`

**Implementation notes**

- Use Expo Push API (`https://exp.host/--/api/v2/push/send`). It's free.
- A queue/batch approach prevents spamming if many ideas are posted rapidly — debounce per group per user (e.g., 60s).
- Respect user preferences before sending — check prefs row in the Edge Function.
- Web does **not** get push notifications in v1 (deferred).

**Validation steps**

- [x] Selection: actor excluded; opted-out users excluded; all of a user's devices included (live dry-run probe + unit tests)
- [x] B taps notification → opens the deep link (`data.path` routing wired)
- [x] B disables "new idea" → selection excludes B for that event (prefs + send-push, probe-verified)
- [x] B signs out → token removed (and pruned on `DeviceNotRegistered`)
- [~] **Manual / real-device:** A posts → B receives push within ~5s — DEFERRED (needs a dev build with an EAS projectId; can't be automated)

**Tests that must pass before Phase 9**

- [x] **Unit:** notification preference filtering logic — `@huddle/core` (11, incl. drift guard) + api-client push (6)
- [x] **Integration:** send-push dry-run probe (9/9, correct selection + payload shape) + live fan-out via `net._http_response`
- [~] **Manual:** real-device push delivery test (cannot reliably automate) — DEFERRED
- [x] **Regression:** prior phases green (typecheck 7, lint 6, pgTAP 157, Playwright 48)

---

### Phase 9 — Anti-Scraping & Security Hardening 🟡 IN-APP COMPLETE (perimeter deferred)

**Objective:** Make the application costly and unappealing to scrape, even for sophisticated actors.

**Status (2026-06-17):** The **in-app** hardening is shipped on branch `phase-9-hardening` (9.1 headers/noindex/robots, 9.2 fail-closed prod assertions, 9.3 SECURITY.md + audit + self-test). The **perimeter** (Cloudflare, Sentry, prod secrets, ToS) is genuinely blocked on a domain (OQ-2) + the relevant accounts + a deployed environment, and is tracked as a live checklist in `docs/SECURITY.md`. The primary access guarantee — Postgres RLS — was re-verified (157 pgTAP assertions + live anon/no-key checks).

**Tasks**

- [ ] Move web DNS to Cloudflare; enable proxy, Bot Fight Mode, Security Level: Medium — **deferred (needs domain + account)**
- [ ] Cloudflare WAF rules — **deferred**
- [ ] Cloudflare Rate Limiting Rules — **deferred** (in-memory search limiter exists as defence-in-depth, D51)
- [x] Verify Turnstile is enforced on web sign-up; mobile has no Turnstile equivalent (gap documented in SECURITY.md)
- [x] Re-check invite token entropy — 256-bit CSPRNG, single-use, 7-day expiry → **Turnstile on invite-create NOT required** (SECURITY.md §2)
- [x] `robots.txt` disallowing crawlers (`Disallow: /`, app is private) — `app/robots.ts`
- [x] `X-Robots-Tag: noindex` header — `next.config.ts` (all routes)
- [ ] Terms of Service forbidding automated access — **deferred (authorship is OQ-8)**
- [ ] Sentry error monitoring — **deferred (needs DSN)**
- [x] Run `pnpm audit` — 26 advisories (6 high, 5 critical), **all in dev/build tooling, not the runtime bundle**; remediation plan in SECURITY.md §4
- [x] Penetration self-test (cross-group read, role tamper, token replay, decision immutability, realtime leakage) — executed; results in `docs/SECURITY.md` §3
- [x] Fail-closed production assertions (Turnstile bypass D38; send-push dev secret D65) — `instrumentation.ts` + send-push
- [x] Security headers (HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy) + report-only CSP

**Files likely affected**

- `apps/web/middleware.ts` (security headers)
- `apps/web/public/robots.txt`
- Cloudflare dashboard config (document in `SECURITY.md`)
- `docs/SECURITY.md`

**Implementation notes**

- CSP (Content-Security-Policy) header is a tarpit — start with `report-only`, observe for a week, then enforce.
- HSTS, X-Frame-Options, Referrer-Policy: configure in `next.config.ts` headers.
- Document every Cloudflare rule and its rationale; dashboard config is otherwise undiscoverable.

**Validation steps**

- [ ] Headless Chrome with default UA against `(app)/*` → blocked or Turnstile-challenged
- [ ] Curl with no auth against any data endpoint → 401
- [ ] Burst of 100 requests in 10s to `/api/profiles/search` → rate-limited
- [ ] Penetration self-test report complete in `SECURITY.md`
- [ ] CSP report-only logs reviewed; no false positives before enforcement

**Tests that must pass before Phase 10**

- [ ] **Unit/Integration:** unchanged from prior phases, must still pass
- [ ] **Manual security test plan** (documented in `SECURITY.md`) executed end-to-end
- [ ] **Regression:** prior phases green

---

### Phase 10 — Polish, Accessibility, Performance, Launch

**Objective:** Ship a beta. Address accessibility, performance, error states, and submit to app stores.

**Tasks**

- [ ] Accessibility audit on web: keyboard nav, focus rings, ARIA labels, axe-core sweep
- [ ] Mobile: VoiceOver and TalkBack passes on critical flows
- [~] Loading skeletons / error boundaries / offline messaging — **error boundary + 404 shipped** (`(app)/error.tsx`, `not-found.tsx`); web **loading skeletons DEFERRED** (Next 16 route `loading.tsx` + in-page `<Suspense>` both linger/duplicate the prior route's DOM with realtime `router.refresh()` — see lesson 21; mobile already has inline loaders)
- [ ] Web Lighthouse audit; target Performance ≥ 90, Accessibility ≥ 95
- [ ] Mobile: cold-start time ≤ 3s on a mid-range device
- [ ] Icon set, splash screens, app store assets
- [ ] Apple Developer account ($99/yr) + Google Play Console ($25 one-time) — out-of-pocket cost gate
- [ ] EAS Build production profiles for iOS and Android
- [ ] App Store + Play Store submission (TestFlight / internal testing first)
- [ ] Production Vercel deploy with custom domain
- [ ] Status page (free tier on UptimeRobot or BetterStack)
- [ ] All docs in `docs/` finalized (see `DOCUMENTATION_PLAN.md`)

**Files likely affected**

- Across the board; primarily UI components and assets
- `apps/mobile/assets/**`
- `docs/**`

**Implementation notes**

- App Store review timelines: budget 1–2 weeks. Apple is stricter; expect a rejection round for things like privacy manifests and sign-in alternatives parity.
- Privacy policy is required for both stores. Draft early.

**Validation steps**

- [ ] Lighthouse scores meet targets on `/groups` and `/groups/[id]`
- [ ] axe-core: zero serious/critical violations
- [ ] TestFlight build installs and runs on real iOS device
- [ ] Play Console internal track build installs on real Android device
- [ ] Production web URL serves over HTTPS via Cloudflare → Vercel
- [ ] Status page reports green

**Tests that must pass before launch**

- [ ] **Full regression:** every unit, integration, and E2E test from every prior phase passes in CI
- [ ] **Smoke test on production:** sign up new user → create group → invite → second user joins → posts idea → picker runs → notification received

---

### Phase 12 — Public, Discoverable Groups ✅ COMPLETE (pending PR)

User-requested: make groups public/discoverable with description, location, and tags.

- [x] **12.1 Schema + RLS + RPCs** — `group_visibility` enum + `description`/`location`/`tags`/`member_count` on `groups` (migration 024); `groups` SELECT widened to member-OR-public (contents stay members-only); `pg_trgm`/GIN search indexes; `member_count` trigger; `group_join_requests` table + `request_to_join`/`respond_to_join_request` RPCs (HD005/HD006). pgTAP (+26). D79/D80.
- [x] **12.2 Validation + data layer** — extended create/update schemas + tag normalization + search schema; `searchPublicGroups`/`requestToJoin`/`fetchJoinRequests`/`respondToJoinRequest`/`fetchMyJoinRequests` + mobile hooks; unit tests.
- [x] **12.3 Web UI** — create/settings fields, `/discover` search, admin approval, hub banner + Playwright (`public-groups.spec`).
- [x] **12.4 Mobile UI** — mirrored create/settings/discover/approval via hooks (device smoke deferred — Maestro).
- [x] **12.5 Join-request push** — `join_request` (→ admins) + `join_approved` (→ requester) on the fan-out seam; migration 025; probe (+2). D81.
- [x] **12.6 Docs + full gate.**
- Deferred: instant-join mode, group bans, anonymous/SEO discovery, FTS ranking, perimeter search rate-limit (with the rest of Cloudflare, D51).

---

### Phase 13 — Hub Engagement ✅ COMPLETE (pending PR)

User-requested: make the group hub more engaging and social.

- [x] **13.1 Activity feed** — schema-free "What's happening" merge of ideas/votes/comments/decisions/joins; `@huddle/api-client/activity(-hooks)`; web + mobile hub. D82.
- [x] **13.2 Live presence** — "N here now" via Realtime Presence (`trackGroupPresence`); web + mobile banner. D83.
- [x] **13.3 RSVP** — `idea_rsvps` (migration 026) + RLS + pgTAP; "Who's in?" on idea detail + going badge on Upcoming; web + mobile. D84.
- [x] **13.4 Reactions** — polymorphic `reactions` (migration 027) over ideas/decisions/comments + RLS + pgTAP; shared `ReactionBar`; web + mobile. D85.
- [x] **13.5 Docs + full gate.**
- Deferred: push for RSVP/reactions (high-frequency), reaction analytics, presence on the dashboard, polls/streaks/nudges (the rest of the brainstorm).

---

### Phase 14 — Personalized Identity + Group Wall ✅ COMPLETE (pending PR)

User-requested: personal + group identity, and a group-level chat surface.

- [x] **14.1 User identity** — `profiles.bio` + a public `avatars` bucket (owner-scoped write RLS); `@huddle/api-client/profiles` (`fetchProfile`/`updateProfile`/`uploadAvatar`) + `bioSchema`; web profile editor on `/account` + mobile editor in settings; avatars render in the hub member list + banner. Migration 028. D86.
- [x] **14.2 Group identity** — admin-picked `groups.emoji`/`color`/`cover_photo_path` (nullable; `group-visuals` falls back to the id-hash); public `group-covers` bucket (admin-scoped write); curated `GROUP_EMOJIS`/`GROUP_COLORS`; pickers in group settings; applied to the hub banner (emoji + accent + cover), dashboard/discover cards, sidebar; web + mobile. Migration 029. D87.
- [x] **14.3 Group wall** — `group_posts` (flat per-group chat, mirrors `idea_comments` D74: member RLS, blocked-author hidden, author/admin delete, immutable, realtime); `@huddle/api-client/posts(-hooks)` + `postBodySchema`; web `/groups/[id]/wall` + mobile screen, hub-linked; web + mobile. Migration 030. D88.
- [x] **14.4 Docs + full gate.**
- Deferred: **@mentions + mention push** (the wall ships first), wall pagination/reactions on posts, rich text/attachments.

---

### Phase 15 — Engagement (panel-driven) 🚧 IN PROGRESS

Scoped from a **3-round simulated user panel** (6 group personas: foodie crew, distributed work team, extended family, big college club, couple, roommates). The panel projected a +1.7 avg lift (5.3 → ~7.0) from this phase and flagged two infra unlocks (a scheduler; an email provider) as the real ceiling.

- [x] **15a Web push** — the panel's unanimous #1 gap. `web_push_subscriptions` (own-row RLS) + a VAPID delivery channel on `send-push` reusing the D65 seam + shared selection (lazy `npm:web-push`); `public/sw.js`; account-page `WebPushToggle`. Migration 031. D89. (Full subscribe→deliver verified manually / deferred — needs a real push service.)
- [x] **15b** Per-group notification muting (`group_notification_prefs`, D90) + **targeted** reaction/RSVP push — a reaction notifies only the target's author, an RSVP "going" only the idea proposer (panel: signal, not chatter). Migrations 032–033. D90–D91.
- [x] **15c** "Decide faster" speed cluster — inline name-only quick-add (D92), relative-date chips Today/Tomorrow/This weekend (D92), and the picker **"just decide" fallback** that pulls past `done` picks when < 2 on-radar ideas (D93, ≥2 rule D63 intact, default pick uniform D60). The existing "🎲 Pick for us" hub button is the decide-now entry. No schema. D92–D93.
- [x] **15d** Lower the auth wall — **passwordless 6-digit OTP sign-in** that doubles as sign-up (D94; local `magic_link` email template renders `{{ .Token }}`, `verifyOtp({type:'email'})`, cross-device, no PKCE-cookie dep) on web + mobile, and **one-tap "✨ Add starter ideas"** in the empty group hub (D95, cold-start fix). Config-only (an email template); no app schema. D94–D95.
- [x] **15e** Power tools — **saved/reusable candidate sets** for the picker (`candidate_sets`, migration 035; the schedulerless half of "recurring" — a named shortlist intersected with the live on-radar pool at pick time, D96), **pinned announcements** on the wall (`group_posts.pinned` + admin-only `set_post_pinned` RPC, migration 036, D97), and **bulk invite** (paste many emails → one each, no schema, D98). Web + mobile. Migrations 035–036. D96–D98.

### Phase 16 — Coordinate & decide (panel-driven) 🚧 IN PROGRESS

- [x] **16a** Counted majority poll — a question + 2..10 options, one changeable vote per member, optional creator/admin close; the structured-vote complement to the random picker. `polls`/`poll_options`/`poll_votes` (migration 037), web `/groups/[id]/polls` + mobile screen. No realtime for v1 (counts refresh on revalidate). D99.
- [x] **16b** Availability "when's free?" poll — a creator proposes dates, each member marks them yes/maybe/no, the group reads the overlap (best = most yes). `availability_polls`/`availability_dates`/`availability_responses` (migration 038), modeled on RSVP (D84); a "When's free?" section on the web polls page + the mobile polls screen. No realtime for v1. D100.
- [x] **16c** @mentions — highlight `@username` in wall posts + idea comments (web + mobile), and **mention push**: send-push notifies the mentioned member via a new `mention` event (the wall pings only mentions; a comment also broadcasts new_comment with the mentioned excluded — no double-ping). `extractMentions` in `@huddle/core` (+ Deno mirror); migration 039 (`notification_prefs.mention`, `get_push_recipients`, `group_posts` trigger). D101.
- [x] **16d** Lightweight small-group mode — an admin-toggled `groups.lite_mode` (migration 040) that trims the hub for couples/roommates: hides the Polls link, activity feed, presence, and do-again/reignite nudges (+ the history page's recap & fairness entry points); keeps the core (picker, new idea, wall, history). No new RLS (rides the admin-only `groups_update_admin` policy); a dedicated instant toggle (web Switch + Server Action, mobile Switch) since a partial-form checkbox can't distinguish "set false" from "no change". Web + mobile. D102.
- [x] **16e** Weekly email digest — a Monday pg_cron job → the `send-digest` Edge Function emails each eligible user a 7-day recap of their groups. **Resend** is the prod adapter (`RESEND_API_KEY`); locally it logs + no-ops, with a dry-run probe + `{user_id}` scope so it's fully testable without an account. `notification_prefs.digest` opt-out (email-only) + a mobile toggle; pure `buildDigestEmail` in `@huddle/core` (+ Deno mirror). Migration 042. D104. **Code-complete; prod sending needs a verified domain (OQ-2) + the Resend key.** Deferred: web prefs UI, one-click unsubscribe, a single aggregating RPC.
- **Infra unlocks (the ceiling):** ~~a scheduler~~ ✅ **unlocked in Phase 17 (pg_cron)**; ~~an email provider~~ ✅ **Resend adapter wired in 16e** (just needs the prod key + domain). Native mobile date picker still needs a dev build.

---

### Phase 17 — Scheduler (pg_cron) 🚧 IN PROGRESS

The first time-driven infra: pg_cron is preloaded in the Supabase stack, so this is the long-deferred "scheduler" unlock (reminders / recurring / nudges / digest cadence) without a separate deploy.

- [x] **17.1 / 17.2 Inactivity nudges** — migration 041 enables `pg_cron` + a daily `inactivity-nudges` job. `dispatch_inactivity_nudges()` finds quiet-but-stocked groups via the pure, pgTAP-tested `groups_needing_nudge(inactive_days, cooldown_days)` (no new ideas/decisions/comments/posts in N days, **≥2 on-radar ideas** so it's actionable, `groups.last_nudged_at` cooldown) and POSTs a synthetic `group_nudge` to send-push — **reusing the D65 fan-out seam** → a `nudge` event for members (prefs + per-group mute + Expo/web all apply; **no email provider needed**). `nudge` wired through `@huddle/core` (+ Deno mirror), `notification_prefs.nudge` (default-on) + `get_push_recipients` + the mobile prefs toggle. D103.
- Deferred (build on this scheduler when wanted): recurring picks, "it's been a while" variants, the **email digest** (16e — now blocked only on an email provider), and invite/token cleanup jobs.

---

## 8. Cross-Phase Testing Strategy

Every phase enforces these gates before progressing.

| Gate           | Tool                             | Scope                                           |
| -------------- | -------------------------------- | ----------------------------------------------- |
| Type-check     | `tsc --noEmit`                   | All packages/apps                               |
| Lint           | ESLint                           | All packages/apps                               |
| Format         | Prettier `--check`               | All packages/apps                               |
| Unit           | Vitest                           | `packages/*`, `apps/web/lib`, `apps/mobile/lib` |
| RLS contract   | pgTAP (or SQL assertion script)  | `supabase/tests/*.sql`                          |
| Edge Functions | Vitest + mocked Supabase         | `supabase/functions/*/test.ts`                  |
| Web E2E        | Playwright                       | `apps/web/tests/e2e/*`                          |
| Mobile E2E     | Maestro                          | `apps/mobile/tests/maestro/*`                   |
| Regression     | Re-run prior phases' tests in CI | All of the above                                |

**Branching:** one feature branch per phase; merge to `main` only after that phase's full test suite is green in CI.

---

## 9. Risks & Open Questions

**Risks (known unknowns)**

- **R-1: Apple Developer review.** First-time review is unpredictable; Apple Sign-In parity is enforced. Mitigation: keep Apple in the auth stack from day one (Phase 2).
- **R-2: Supabase free-tier auto-pause.** A free Supabase project pauses after 7 days of inactivity. Mitigation: monitor; upgrade to the $25/mo plan before public launch.
- **R-3: RLS misconfiguration leaking data.** This is the single highest-impact risk. Mitigation: pgTAP coverage on every policy in Phase 1, plus a manual pen test in Phase 9.
- **R-4: Realtime + RLS interactions.** Easy to broadcast to a channel that the client filters but the server doesn't. Mitigation: server-side filtered publications and explicit verification in Phase 6.
- **R-5: Push notification fatigue.** Too many notifications → uninstalls. Mitigation: per-type preferences (Phase 8), debounce, and in-app review after the first week.
- **R-6: Solo-build burnout.** Scope is real. Mitigation: any non-MVP idea goes into a `BACKLOG.md` rather than getting absorbed into a phase.
- **R-7: Image moderation.** Users can upload photos. We have no moderation. Mitigation: needs a decision before launch (see open questions).

**Open questions (must be answered before they become blockers)**

- [x] **OQ-1: Project name.** Resolved → **Huddle**.
- [ ] **OQ-2: Domain name.** Needed by Phase 10 at the latest.
- [x] **OQ-3: Bundle identifiers.** Resolved → **`com.huddleapp.huddle`** (iOS + Android), set in `apps/mobile/app.json`.
- [x] **OQ-4: Visual design direction.** Resolved → "Pop" direction: violet brand (c-purple) + pink accent (c-pink), Montserrat Bold + Lato Regular type on web (mobile keeps the native system font), and the brand logo (figures + lightbulb) wired in both apps. **Light/dark mode** with a persisted system/light/dark toggle: web uses semantic `@theme` tokens + a `.dark` class with a no-flash script; mobile uses a `ThemeContext` + `useColors()` theme-aware `makeStyles(c)` factories. Tokens in `globals.css` (web) / `apps/mobile/src/lib/theme.ts` (mobile). Shipped on PR #10.
- [x] **OQ-5: Image moderation policy.** Resolved → manual **report-and-review** (D53), and **built** in Phase 10 (D72): `reports` + `blocked_users`, report/block UI on web + mobile, RLS-enforced block. No automated scanning / admin UI yet (manual review via service role).
- [x] **OQ-6: Account deletion.** Built → **in-app self-serve deletion** (`delete-account` Edge Function + web `/account` + mobile settings). Deletion de-attributes content (SET NULL), refuses sole-admin-of-shared-group, cleans up solo groups. Data export deferred (not store-required for v1).
- [ ] **OQ-7: Geographic scope.** US only? Global? Affects compliance posture.
- [ ] **OQ-8: Terms of Service & Privacy Policy authorship.** Are you writing these, using a template (Termly, iubenda), or hiring? Required by both app stores.
- [ ] **OQ-9: Username vs display name uniqueness rules.** Username is unique; display name is free-form. Confirm.
- [x] **OQ-10: Invite link revocation.** Resolved in Phase 4 → yes. Implemented as DELETE (per the Phase 1 RLS design) rather than a flag; a revoked token reads as "not found", indistinguishable from never-existed.
- [x] **OQ-11: License.** Resolved → **proprietary / all rights reserved** (`LICENSE` at repo root). Source is reference-only; no reuse license granted.

---

## 10. Next Steps

Before we start Phase 0, you need to answer or decide:

- [ ] **OQ-1 (project name):** required to create the GitHub repo
- [ ] **OQ-3 (bundle IDs):** recommended early so Expo config doesn't churn

Once those are settled, the immediate next actions are:

1. Approve this roadmap (or request edits).
2. Resolve OQ-1 and OQ-3 at minimum.
3. Tell me to start Phase 0. I will then produce, in this order:
   - The exact `package.json`, `pnpm-workspace.yaml`, `turbo.json`, and `tsconfig.base.json`
   - Commands to scaffold `apps/web` and `apps/mobile`
   - The `.github/workflows/ci.yml`
   - Validation that all Phase 0 checkboxes pass before we touch Phase 1

I will not write code outside the current phase. If a question arises mid-phase that the roadmap doesn't answer, I stop and ask rather than guess.
