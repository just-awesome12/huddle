# Huddle — Project Roadmap

> **Status:** Phase 0 scaffolding generated; pending local validation by builder
> **Last updated:** 2026-05-13
> **Owner:** Solo build
> **Working title:** Huddle (placeholder bundle ID: `app.placeholder.huddle`)

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

| Layer | Choice | Reasoning |
|---|---|---|
| Monorepo | Turborepo + pnpm workspaces | Standard, fast, well-documented |
| Language | TypeScript (`strict`) | Required by you |
| Web | Next.js 15 (App Router) | Hybrid SSR/CSR, mature, Vercel-first |
| Mobile | Expo SDK 52 + React Native 0.76 | Single TS codebase, OTA updates, managed builds via EAS |
| Web styling | Tailwind CSS + shadcn/ui | Accessible, themable, fast to build |
| Mobile styling | NativeWind (Tailwind for RN) | Keeps styling vocabulary consistent with web |
| State / data | TanStack Query + Supabase client | Cache + realtime invalidation |
| Forms | React Hook Form + Zod | Type-safe forms shared between apps |
| Validation | Zod | Shared between client and server |
| DB / Auth / Storage / Realtime | Supabase | One service covers four needs |
| Auth providers | Email/password, Google, Apple | Per your spec |
| Edge logic | Supabase Edge Functions (Deno) | For picker shuffle, invite tokens, rate limits |
| Push notifications | Expo Push Notifications + `expo-notifications` | Free, integrated with mobile build |
| Anti-bot | Cloudflare proxy + Cloudflare Turnstile | Free tier, low integration cost |
| CDN / proxy | Cloudflare (web) | Bot fight, rate limiting, WAF |
| Hosting (web) | Vercel | First-party Next.js host |
| Hosting (mobile) | App Store + Google Play, builds via EAS | Required for native deployment |
| CI/CD | GitHub Actions + EAS Build + Vercel Git integration | Standard |
| Unit tests | Vitest | Fast, ESM-native |
| Web E2E | Playwright | Best-in-class |
| Mobile E2E | Maestro | Simpler than Detox; YAML flows |
| Linting / formatting | ESLint + Prettier (shared configs) | Standard |
| Error monitoring | Sentry (free tier) | Web + mobile + edge functions |
| Analytics (post-MVP) | PostHog or Plausible (deferred) | Will revisit when usage data matters |

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
- Don't write any feature code yet — this phase is *only* substrate.

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
- Apple Sign-In on web requires the "Sign in with Apple JS" SDK *or* the OAuth flow — confirm which Supabase currently supports best at implementation time.
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

### Phase 3 — Groups & Membership

**Objective:** Users can create groups, view their groups, see members, leave groups, and (as admin) remove members or delete groups.

**Tasks**
- [ ] Zod schemas for group create/update payloads in `packages/validation`
- [ ] Hooks: `useMyGroups`, `useGroup(id)`, `useGroupMembers(id)`, `useCreateGroup`, `useDeleteGroup`, `useLeaveGroup`, `useRemoveMember` (all in `packages/api-client`)
- [ ] **Web:** `/groups` (list), `/groups/new`, `/groups/[id]` (detail), `/groups/[id]/settings`
- [ ] **Mobile:** equivalent screens
- [ ] Member list with role badges; admin-only controls (remove, delete) gated by role check in UI **and** by RLS at DB
- [ ] Confirmation dialogs for destructive actions

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
- [ ] Create a group → appears in my list → I'm admin
- [ ] Second user (no membership) cannot see the group via API
- [ ] Admin can rename, member cannot
- [ ] Admin can remove a member; removed member loses access immediately
- [ ] Member can leave; admin cannot leave if sole admin (block with friendly error)
- [ ] Admin can delete; cascades remove all related rows

**Tests that must pass before Phase 4**
- [ ] **Unit:** Group Zod schemas
- [ ] **Integration:** Group hook mutations against a test Supabase project (or local stack)
- [ ] **E2E (web):** create group → invite flow stub → view detail
- [ ] **Regression:** All Phase 1 + Phase 2 tests still pass

---

### Phase 4 — Group Invitations

**Objective:** Three working invite paths — invite link, email invite (in-app, not actual email yet for v1 since email notifications are v2), and username search.

**Tasks**
- [ ] Edge Function: `create_invite` — generates a cryptographically random token, writes `group_invites` row, returns shareable URL
- [ ] Edge Function: `accept_invite` — validates token + expiry + not-already-accepted, inserts `group_members` row
- [ ] **Web/Mobile:** "Invite to group" UI: generate link button, copy-to-clipboard, QR code (mobile)
- [ ] Username search: `/api/profiles/search?q=...` (Next.js route handler) with case-insensitive prefix match, capped at 10 results, rate-limited
- [ ] "Add by username" flow that creates an invite addressed to a `user_id`
- [ ] Accept-invite page (web) and deep link handler (mobile) for `/invites/[token]`

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
- [ ] Generate invite link → second user opens link signed-out → prompted to sign in → after auth, accept flow runs → they're a member
- [ ] Reused token (already accepted) → friendly error
- [ ] Expired token → friendly error
- [ ] Username search returns matches; non-existent username returns empty
- [ ] Username search rate-limited after 10 rapid calls
- [ ] Mobile deep link `groupdecide://invites/<token>` opens accept screen

**Tests that must pass before Phase 5**
- [ ] **Unit:** invite token generator (length, charset, uniqueness over 1M draws)
- [ ] **Integration:** Edge Functions tested with `supabase functions serve` locally
- [ ] **E2E (web):** two-browser test — admin invites, second user accepts
- [ ] **Regression:** prior phases green

---

### Phase 5 — Ideas (CRUD + Photo Upload)

**Objective:** Group members can create, view, edit (limited fields), change status of, and delete ideas. Photos upload to Supabase Storage with RLS-protected access.

**Tasks**
- [ ] Zod schemas for idea create/update
- [ ] Hooks: `useIdeas(groupId, filters)`, `useCreateIdea`, `useUpdateIdea`, `useUpdateIdeaStatus`, `useDeleteIdea`
- [ ] Supabase Storage bucket `idea-photos` with RLS: read/write only by group members of the parent idea's group
- [ ] **Web:** ideas list view per group with filters (status, category); create-idea form; idea detail; edit form (proposer/admin only)
- [ ] **Mobile:** equivalents using native image picker (`expo-image-picker`)
- [ ] Image compression before upload (max ~1MB, max 1920px long edge) using `browser-image-compression` (web) or `expo-image-manipulator` (mobile)
- [ ] Empty states and skeleton loaders

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
- [ ] Create idea with all fields → appears in list
- [ ] Upload photo → renders; non-member cannot fetch the photo URL even if guessed
- [ ] Filter by category → list updates
- [ ] Filter by status → list updates
- [ ] Non-proposer non-admin cannot edit title/description (UI hidden + RLS blocks)
- [ ] Any member can mark on_radar → done
- [ ] Soft-delete vs hard-delete: decide at implementation; if hard-delete, confirm cascades are correct

**Tests that must pass before Phase 6**
- [ ] **Unit:** idea schema validations
- [ ] **Integration:** photo upload + signed URL retrieval with correct/incorrect membership
- [ ] **E2E (web):** create idea, upload photo, change status, filter
- [ ] **Regression:** all prior tests green

---

### Phase 6 — Realtime

**Objective:** Changes to groups, ideas, and decisions appear in real time for all connected members without polling.

**Tasks**
- [ ] Enable Realtime publications in Supabase for `groups`, `group_members`, `ideas`, `decisions`
- [ ] Realtime subscription hook in `packages/api-client`: `useRealtimeChannel(channelName, filters)`
- [ ] Wire subscriptions into existing TanStack Query caches: on event, invalidate or patch the relevant query
- [ ] Connection state indicator (subtle, e.g., a small dot) for both apps
- [ ] Reconnect-on-resume logic for mobile (when app returns from background)

**Files likely affected**
- `supabase/migrations/*realtime*.sql`
- `packages/api-client/src/realtime.ts`
- `apps/web/components/RealtimeProvider.tsx`
- `apps/mobile/components/RealtimeProvider.tsx`

**Implementation notes**
- Don't naively invalidate everything on any change — scope subscriptions per group the user is viewing, plus a global "my groups" channel.
- Realtime payloads still go through RLS; a user will not receive events for groups they aren't in. Verify this empirically — it's a common source of leaks if Realtime is misconfigured.
- Throttle invalidations (e.g., one per 500ms per query key) to prevent storms.

**Validation steps**
- [ ] Two browsers, same group: user A adds idea → user B sees it within ~1s
- [ ] User B is removed from group → user B no longer receives events from that group
- [ ] Mobile app backgrounded for 5 min and resumed → subscription reconnects and missed state is fetched

**Tests that must pass before Phase 7**
- [ ] **Integration:** realtime subscription delivers events that match RLS scope
- [ ] **E2E (web):** two-context Playwright test verifying live update
- [ ] **Regression:** all prior tests green

---

### Phase 7 — Random Picker & Decision History

**Objective:** A working "pick for us" feature that selects from on_radar ideas, supports filters and shortlist mode, and records every decision for history.

**Tasks**
- [ ] Edge Function: `run_picker(group_id, options)` — validates membership, queries candidates respecting filters, performs cryptographically random pick (`crypto.getRandomValues`), inserts `decisions` row, returns chosen idea
- [ ] Picker UI on web: modal with options (category filter checkboxes, optional "shortlist these N" toggle with idea multi-select), animated reveal
- [ ] Picker UI on mobile: equivalent with native feel
- [ ] Decisions list view per group ("History" tab) showing past picks
- [ ] Empty-state copy for when there are no on_radar ideas

**Files likely affected**
- `supabase/functions/run-picker/index.ts`
- `packages/core/src/picker.ts` (pure shuffle logic, unit-testable)
- `apps/web/app/(app)/groups/[id]/pick/**`
- `apps/mobile/app/(app)/groups/[id]/pick.tsx`

**Implementation notes**
- The picker runs **server-side only** (Edge Function) so the result can't be re-rolled by a tampering client. The `decisions` table has RLS allowing INSERT only by `service_role`, enforced by the Edge Function using its secret key.
- Pure shuffle/pick logic lives in `packages/core/src/picker.ts` so it can be unit-tested without infrastructure. The Edge Function imports it.
- Animation: a 1–2s "drumroll" CSS/Reanimated transition before reveal. Keep tasteful.

**Validation steps**
- [ ] Picker with no candidates → friendly empty state, no decision recorded
- [ ] Picker with 1 candidate → that one is picked
- [ ] Picker with N candidates → distribution looks uniform over 100 runs (manual or scripted check)
- [ ] Picker with shortlist of 3 → only those 3 are candidates
- [ ] Decision appears in history with timestamp, run_by, candidates, chosen
- [ ] Non-member cannot invoke the Edge Function for that group

**Tests that must pass before Phase 8**
- [ ] **Unit:** picker logic (uniformity over large N, edge cases: empty, single, duplicates)
- [ ] **Integration:** Edge Function with mocked Supabase client
- [ ] **E2E (web):** run picker, see history entry, click into chosen idea
- [ ] **Regression:** prior phases green

---

### Phase 8 — Push Notifications (Mobile)

**Objective:** Mobile users receive push notifications for: new idea in their group, picker ran in their group, they were invited to a group.

**Tasks**
- [ ] Request notification permissions on mobile app first-run (after sign-in)
- [ ] Register Expo push token; store in `push_tokens` table
- [ ] Edge Function or database trigger: on `ideas.INSERT`, fan out push to all group members except the proposer
- [ ] Same for `decisions.INSERT` and `group_invites.INSERT` (when invitee user_id known)
- [ ] Notification tap → deep link to the relevant screen
- [ ] In-app notification preferences screen (toggle each type)
- [ ] Token cleanup: on receive-error or sign-out, mark token inactive

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
- [ ] User A and B in same group on two devices. A posts idea → B receives push within ~5s
- [ ] B taps notification → opens the new idea
- [ ] B disables "new idea" notifications → A posts → B receives nothing
- [ ] B signs out → token marked inactive; old pushes don't reach device

**Tests that must pass before Phase 9**
- [ ] **Unit:** notification preference filtering logic
- [ ] **Integration:** Edge Function sends to mocked Expo endpoint with correct payload shape
- [ ] **Manual:** real-device push delivery test (cannot reliably automate)
- [ ] **Regression:** prior phases green

---

### Phase 9 — Anti-Scraping & Security Hardening

**Objective:** Make the application costly and unappealing to scrape, even for sophisticated actors.

**Tasks**
- [ ] Move web DNS to Cloudflare; enable proxy (orange cloud), Bot Fight Mode, and Security Level: Medium
- [ ] Cloudflare WAF rules: block known scraper UAs, geo-rate-limit if needed
- [ ] Cloudflare Rate Limiting Rules: aggressive limits on `/api/*` and auth endpoints
- [ ] Verify Turnstile is enforced on every sign-up code path (web + mobile)
- [ ] Add Turnstile to "create invite" if invite links can be brute-forced — re-check token entropy from Phase 4
- [ ] `robots.txt` disallowing all crawlers on `(app)/*` routes
- [ ] `X-Robots-Tag: noindex` header on authenticated pages
- [ ] Terms of Service draft explicitly forbidding automated access; link from sign-up
- [ ] Sentry: enable error monitoring with PII scrubbing rules
- [ ] Run `npm audit` and resolve any high/critical
- [ ] Penetration self-test using a second account: try to read another group's data, modify roles, replay tokens, etc. Document results in `SECURITY.md`

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
- [ ] Loading skeletons everywhere; error boundaries; offline messaging
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

## 8. Cross-Phase Testing Strategy

Every phase enforces these gates before progressing.

| Gate | Tool | Scope |
|---|---|---|
| Type-check | `tsc --noEmit` | All packages/apps |
| Lint | ESLint | All packages/apps |
| Format | Prettier `--check` | All packages/apps |
| Unit | Vitest | `packages/*`, `apps/web/lib`, `apps/mobile/lib` |
| RLS contract | pgTAP (or SQL assertion script) | `supabase/tests/*.sql` |
| Edge Functions | Vitest + mocked Supabase | `supabase/functions/*/test.ts` |
| Web E2E | Playwright | `apps/web/tests/e2e/*` |
| Mobile E2E | Maestro | `apps/mobile/tests/maestro/*` |
| Regression | Re-run prior phases' tests in CI | All of the above |

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
- [ ] **OQ-3: Bundle identifiers** for iOS (`com.x.y`) and Android (`com.x.y`). Currently placeholder `app.placeholder.huddle`. Must be finalized before Phase 10 store submission.
- [ ] **OQ-4: Visual design direction.** Color palette, logo, typography. Currently using shadcn defaults; needs a pass before launch.
- [ ] **OQ-5: Image moderation policy.** User-uploaded photos can be anything. Options: (a) no moderation (risky); (b) manual report-and-review; (c) automated (Hive, AWS Rekognition — costs money). Need a decision before Phase 5.
- [ ] **OQ-6: Account deletion & data export.** Many jurisdictions (GDPR, CCPA) require these. Even if we don't market in the EU, app stores increasingly require deletion. Plan a sub-task in Phase 10.
- [ ] **OQ-7: Geographic scope.** US only? Global? Affects compliance posture.
- [ ] **OQ-8: Terms of Service & Privacy Policy authorship.** Are you writing these, using a template (Termly, iubenda), or hiring? Required by both app stores.
- [ ] **OQ-9: Username vs display name uniqueness rules.** Username is unique; display name is free-form. Confirm.
- [ ] **OQ-10: Invite link revocation.** Should admins be able to revoke an unused invite? (Recommended: yes, via a "revoked" flag — small addition to Phase 4.)
- [ ] **OQ-11: License.** Currently "all rights reserved" by default. Pick a license (MIT, Apache-2.0, GPL, or proprietary) before public launch. Affects whether outside contributors can engage.

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
