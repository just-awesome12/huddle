# CLAUDE.md — Huddle project context

This file is the standing context for Claude Code working on the Huddle project. Read it on every session start. When it conflicts with anything in conversation, conversation wins, but flag the conflict.

---

## 1. Project overview

**Huddle** is a group-based idea-sharing app. Members of a group share ideas (places to eat, activities to do, events to attend), discuss them, and use a random-picker tool when the group can't agree. Decisions are logged historically so the group can see what they actually did.

Targets: **web (Next.js)** and **mobile (Expo / React Native)**, sharing a TypeScript monorepo and a single Supabase backend. Working title is "Huddle"; a final name is open question OQ-1.

**Owner / single developer:** Justin Hein (justin.hein85@gmail.com, GitHub `just-awesome12`). Working from a Windows machine with Git Bash, Docker Desktop, and a local Supabase via the Supabase CLI. Project lives at `C:\Temp\huddle`.

---

## 2. Stack and conventions

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | Turborepo + pnpm workspaces | `pnpm install` at root |
| Web | Next.js 16 (App Router) + Tailwind v4 | Server Actions for all mutations; Server Components for reads |
| Mobile | Expo SDK 55 + React Native + Expo Router | File-based routing mirrors App Router |
| Backend | Supabase (Postgres + Auth + RLS + Realtime + Storage) | Local stack via `supabase start` |
| Auth | Email/password + Google OAuth | Apple deferred (needs developer account) |
| Anti-scraping | Cloudflare Turnstile (web) + auth wall + Cloudflare proxy | Mobile has no Turnstile equivalent |
| Push | Expo Push v1 | Real APNs/FCM later |
| Web E2E | Playwright | 32 tests, all passing |
| Mobile E2E | Maestro (deferred to Phase 9) | Not set up yet; Expo web preview used for smoke tests |
| Unit | Vitest | 64 (validation) + 96 (api-client) = 160 |
| RLS | pgTAP | 144 assertions across 11 files |

### Workspace layout

```
apps/
  web/          Next.js app
  mobile/       Expo app
packages/
  api-client/   Supabase client factories + error mapping + Turnstile verifier
  validation/   Shared Zod schemas
  types/        Generated Database type
  core/         Reserved for shared logic (not heavily used yet)
  config/       Shared tsconfig + eslint configs
supabase/
  migrations/   SQL migrations (13 so far)
  tests/        pgTAP tests
  seed.sql      Test users + seed group
  config.toml   Local Supabase config
docs/
  ARCHITECTURE.md
  ARCHITECTURE_PHASE2_APPENDIX.md   ← full Phase 2 design + decision log D26–D42
  ARCHITECTURE_PHASE3_APPENDIX.md   ← full Phase 3 design + decision log D43–D47
  ARCHITECTURE_PHASE4_APPENDIX.md   ← full Phase 4 design + decision log D48–D51
ROADMAP.md     ← phase plan (Phases 0–4 = ✅ COMPLETE)
SETUP.md       ← env setup
```

### Subpath import conventions

- Web imports Supabase only via `@huddle/api-client/{browser,server,service-role,errors,turnstile,groups,invites,profiles}`
- Mobile imports Supabase only via `@huddle/api-client/{native,errors,groups-hooks,invites-hooks,profiles-hooks}`
- Feature data lives in paired subpaths: `/groups` (framework-free raw functions, server-safe) and `/groups-hooks` (TanStack Query wrappers, client-only). Same for `/invites` and `/profiles`. Future features (ideas, decisions) follow the same pattern.
- Apps **never** import from `@supabase/*` directly — types like `Session`, `User`, `SupabaseClient` are re-exported through the api-client `/native` and `/server` subpaths

---

## 3. What's shipped (Phases 0–4)

**Phase 0** — Monorepo scaffold, Next.js 16 + Expo SDK 55 apps, 5 shared packages, Supabase config, GitHub Actions CI. Repo: `github.com/just-awesome12/huddle`.

**Phase 1** — Full DB schema and RLS. 8 tables + 1 storage bucket, enums, helpers (`is_group_member`, `is_group_admin`), `handle_new_user` trigger, last-admin enforcement, 120 pgTAP assertions. Decisions table is append-only. Profiles publicly readable to authenticated users.

**Phase 2** — Authentication. Email/password + Google OAuth on both web and mobile. Web uses Server Actions + a proxy (`apps/web/src/proxy.ts`, renamed from middleware per Next 16). Mobile uses a React Context (`AuthProvider`) + `GatedStack` redirect logic in `app/_layout.tsx`. Onboarding flow for OAuth users. Cloudflare Turnstile on web sign-up with test-mode bypass for E2E. **Full architecture in `docs/ARCHITECTURE_PHASE2_APPENDIX.md` — read that before doing any auth work.**

The Phase 2 close point is tagged `phase-2-complete`.

**Phase 3** — Groups & Membership. Group CRUD + member management on web and mobile. Shared data layer split: raw functions in `@huddle/api-client/groups` (web Server Components/Actions), TanStack Query hooks in `/groups-hooks` (mobile). `create_group` SECURITY DEFINER RPC works around an INSERT…RETURNING vs RLS interaction. Web reads via Server Components, mutations via Server Actions; mobile screens mirror the web URL shape. **Full architecture in `docs/ARCHITECTURE_PHASE3_APPENDIX.md`.** Shipped via PR #1 (branch `phase-3-groups`).

**Phase 4** — Group Invitations. All three join paths (link / email / username) on web and mobile. `peek_invite` + `accept_invite` SECURITY DEFINER RPCs with the HD000–HD004 error contract — no Edge Functions (D48). Deep links survive auth: web `?next=` round-trip, mobile pending-path stash (D49). Invites share as web URLs via `EXPO_PUBLIC_WEB_URL` (D50). Rate-limited `/api/profiles/search` + "Invites for you" sections. Also fixed a latent Phase 2 supabase-js auth-callback deadlock (lesson 14). **Full architecture in `docs/ARCHITECTURE_PHASE4_APPENDIX.md`.** Shipped via PR #4 (branch `phase-4-invites`).

---

## 4. Decision log (D1–D51)

D1–D25 from earlier phases are captured in the main `ARCHITECTURE.md`. D26–D42 are in `ARCHITECTURE_PHASE2_APPENDIX.md`. D43–D47 are in `ARCHITECTURE_PHASE3_APPENDIX.md`. D48–D51 are in `ARCHITECTURE_PHASE4_APPENDIX.md`. Highlights that affect ongoing work:

| # | Decision |
|---|---|
| D26 | Web auth uses Server Actions, not client-side Supabase calls. |
| D29 | `'use server'` files export only async functions. Shared types live in sibling `*-state.ts` files. |
| D30 | Local dev has email confirmation OFF; production will enable it. |
| D31 | `handle_new_user` creates `profiles` row with placeholder username `u_<12hex>` at signup. |
| D32 | Onboarding is gated at the proxy (web) / GatedStack (mobile) by detecting the placeholder username. |
| D33 | Email-signup users bypass onboarding — server action / submit handler writes the chosen username immediately. Onboarding is effectively OAuth-only. |
| D34 | Turnstile uses "managed" mode. |
| D35 | Local dev uses Cloudflare's always-pass test keys. |
| D36 | Turnstile verifier lives in `@huddle/api-client` — the package is the seam between apps and external services. |
| D37 | Turnstile test mode requires BOTH `NEXT_PUBLIC_TURNSTILE_TEST_MODE=true` AND the documented Cloudflare test secret. **Cloudflare's test secret only accepts tokens issued by the matching test site key** — cross-pairing real + test keys fails silently. |
| D38 | Phase 9 will add a startup assertion that refuses to boot in production with test mode on. |
| D39 | Mobile auth state lives in a single React Context (`AuthProvider`) at the root layout. |
| D40 | Mobile navigation uses Expo Router (file-based). |
| D41 | Mobile auth errors are shown inline (no toasts). |
| D42 | Mobile Google OAuth uses `expo-auth-session` + `WebBrowser.openAuthSessionAsync` + manual `setSession`. Native SDK (`react-native-google-signin`) is more robust but needs a custom dev build — revisit later if OAuth UX needs improvement. |
| D43 | Web reads use Server Components + raw api-client functions; mutations use Server Actions. TanStack Query hooks are for mobile / client components only. |
| D44 | api-client splits framework-free raw functions (`/groups`) from react-query hooks (`/groups-hooks`) so server bundles never import react-query. |
| D45 | Group creation goes through the `create_group` SECURITY DEFINER RPC (INSERT…RETURNING is checked against the SELECT policy before the membership trigger runs). |
| D46 | Mobile screen routes mirror the web URL shape for deep-link parity (`huddle://groups/...`, Phase 4). |
| D47 | `react` is pinned in api-client devDependencies to mobile's version so pnpm builds exactly one react-query instance (see lesson 12). |
| D48 | Invite acceptance via `peek_invite` / `accept_invite` SECURITY DEFINER RPCs (not Edge Functions); custom HD000–HD004 SQLSTATEs are the client error contract — map by code, never by message text. Edge Functions debut in Phase 7. |
| D49 | Mobile resumes deep links after auth via a module-scope pending-path stash in GatedStack (web equivalent: the proxy's `?next=` round-trip, open-redirect-guarded in the auth actions). |
| D50 | Invites are shared as web URLs built from `EXPO_PUBLIC_WEB_URL` so recipients without the app can join; `huddle://` resolves the same path in-app. Universal links are Phase 10. |
| D51 | v1 search rate limiting is an in-memory per-user sliding window in the Next route handler — defence-in-depth only; the perimeter limit is Phase 9 (Cloudflare). Mobile queries PostgREST directly until then. |

---

## 5. Lessons learned (apply on every change)

These are non-negotiable. The previous build hit them all. Read before generating Expo, pnpm, or framework-specific code.

1. **Expo SDK 55 unified versioning.** Every Expo package matches the SDK major (`expo-router: ~55.0.x`, not `~5.0.0`). **Don't hand-write Expo version ranges.** Use `expo install <pkg>` or `expo install --fix`. The convention changes between SDK versions — never assume it's stable.

2. **Audit scaffold files when first touching an app directory.** `create-next-app` and `create-expo-app` generate demo files that conflict with our structure (`src/app/page.tsx` on web, `app/(tabs)/`, `modal.tsx`, `+not-found.tsx` on mobile, root-level `components/` and `constants/` dirs). Delete them in the same change that adds real files.

3. **Native-only modules need web fallbacks.** `expo-secure-store` throws on web. The mobile Supabase client has a platform-aware adapter (SecureStore on native, localStorage on web). If you add another native-only module and the web preview is supported, do the same.

4. **TS2742 in pnpm workspaces.** When `declaration: true` is on and React types are involved, pnpm's symlinked node_modules layout triggers "cannot be named without a reference to .pnpm/..." errors. Apps (not libraries) should set `declaration: false` + `composite: false` in their tsconfigs.

5. **`'use server'` files export only async functions.** Shared types and constants go in a sibling file (e.g., `auth-state.ts` next to `auth.ts`).

6. **Strict TypeScript everywhere.** The shared base config has `strict: true` + `noUncheckedIndexedAccess: true`. Sandbox-test against the same config or you'll ship code that fails on real tsconfig.

7. **The Supabase CLI sometimes regresses.** In the version Justin has, `redirect_uri = ""` in `[auth.external.google]` is treated as missing and breaks OAuth start (error: "Unsupported provider: missing redirect URI"). Set an explicit `redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"`. CLI updates can introduce surprises — don't update mid-phase.

8. **Mobile dev URL differs by platform.** Web preview / iOS sim: `127.0.0.1:54321`. Android emulator: `10.0.2.2:54321`. Physical device: machine's LAN IP. Switching is currently manual via `.env.local`; we may add runtime detection later.

9. **Cloudflare Turnstile in Playwright.** Headless Chromium can't reliably produce a Turnstile token. Phase 2 uses a client-side bypass when `NEXT_PUBLIC_TURNSTILE_TEST_MODE=true`, and the server skips verification when the secret equals the documented test secret. Both must be true; either alone fails closed. Production has neither.

10. **Web-search current framework behavior BEFORE generating code that depends on framework specifics**, not after it fails. Especially: Expo SDK behaviors, native module web compatibility, Next.js App Router conventions for the current major version, pnpm + TypeScript interactions. Justin's biggest source of round-trips in Phase 2 was Claude generating from memory instead of checking.

11. **tsconfig `paths` is part of Metro's RUNTIME resolution on mobile.** Expo's Metro resolves modules through tsconfig `paths`. A TS-only workaround like `"react": ["./node_modules/@types/react"]` makes Metro bundle the type-stubs package as the real module (Phase 3 found every mobile web bundle broken since 2.6 this way). Never add tsconfig path mappings on mobile for type-resolution reasons — and remember "typecheck green" says nothing about whether the app bundles. Smoke the bundle after dependency or tsconfig changes.

12. **pnpm can build two instances of the same package version.** Peer dependencies resolve per importer; `@tanstack/react-query@5.101.0` existed twice (`…_react@19.2.0` and `…_react@19.2.4`) because api-client didn't pin react. Context-based libraries then fail at runtime ("No QueryClient set") while typecheck stays green. Diagnose with `require.resolve(pkg, { paths: [dirA, dirB] })`; fix by pinning the peer to the consuming app's version (D47).

13. **`INSERT…RETURNING` is checked against the SELECT policy before AFTER-triggers run.** If a row's visibility depends on a trigger-created row (e.g. groups visible via membership the trigger inserts), `insert().select()` fails with 42501 even though the plain insert succeeds. Use a SECURITY DEFINER RPC that returns the row (D45).

14. **Never await supabase queries inside `onAuthStateChange`.** The callback fires while supabase-js holds its auth lock (Web Locks API on web); any `.from()`/`.rpc()` call re-acquires that lock to attach the access token → the entire client deadlocks (infinite spinner, sign-out does nothing). Defer queries out of the callback (`setTimeout(..., 0)`). It's intermittent on web (races hydration) and **impossible on native** (no Web Locks), so green native behavior proves nothing. Diagnose with `navigator.locks.query()` — `lock:sb-127-auth-token` held with an empty pending list is the smoking gun. Bit us from Phase 2 until the Phase 4.4 smoke test caught it.

15. **PostgREST embeds need explicit FK hints when a table has multiple FKs to the same target.** `group_invites` has three FKs to `profiles`; `select('*, profiles(...)')` is ambiguous — name the constraint: `profiles!group_invites_invited_user_id_fkey(...)`.

---

## 6. Working norms

- **Small slices.** Even small features ship in sub-phases (e.g., Phase 2 became 2.1 through 2.7). Each sub-phase has an explicit test gate.
- **Tests before "done."** Unit/integration tests for shared packages. Playwright for web flows. pgTAP for RLS regressions. Manual smoke for mobile (Maestro deferred to Phase 9).
- **Honest documentation of deferrals.** When something can't be done now (Apple OAuth, native mobile OAuth verification, Maestro), capture WHY in the roadmap rather than pretending it's complete.
- **Architecture decisions get a log entry.** Numbered (continue from D51), one-line summary, with rationale captured wherever it's relevant (often in the architecture appendix).
- **Justin debugs by sharing exact error output.** Encourage this — it's the most efficient diagnostic path. The Phase 2 work showed it consistently saved iteration cycles.

---

## 7. Environment specifics

### Local Supabase

```bash
# Start (12 containers)
supabase start

# Stop
supabase stop

# Reset DB to migrations + seed (wipes data)
supabase db reset

# Run pgTAP tests
supabase test db
```

Supabase must be running for Playwright, manual testing, and the dev server. If you see `ECONNREFUSED 127.0.0.1:54321` anywhere, that's the cause.

### Env files

**`apps/web/.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_TURNSTILE_TEST_MODE=true
NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA      # test pair
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA     # test pair
```

**`apps/mobile/.env.local`:**
```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
```

(Production Cloudflare keys are saved separately for Phase 9. Real Google OAuth Web Client ID is configured in `supabase/config.toml` via env-var refs.)

### Supabase config snippet (auth-relevant)

```toml
[auth]
site_url = "http://localhost:3000"
additional_redirect_urls = [
  "http://localhost:3000/**",
  "http://127.0.0.1:3000/**",
  "huddle://**"
]

[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"   # must be explicit
```

---

## 8. Open questions (not yet resolved)

- **OQ-1** Final product name (currently "Huddle")
- **OQ-2** Domain name (revisit in Phase 10)
- **OQ-3** Real bundle IDs (currently `app.placeholder.huddle`)
- **OQ-4** Visual design direction
- **OQ-5** Image moderation strategy (Phase 5)
- **OQ-6** Account deletion / GDPR flow
- **OQ-7** Geographic scope (single-region vs multi-region)
- **OQ-8** ToS / Privacy policy authorship
- **OQ-11** License (currently "all rights reserved")

These shouldn't block Phase 5 work but should get answered before Phase 10.

---

## 9. Status: where you're starting

**Just closed:** Phase 4 (Group Invitations), shipped as 4.1 (RPCs + data layer), 4.2 (web UI + auth deep links), 4.3 (mobile UI + deep-link resume), 4.4 (username search + add-by-username) on branch `phase-4-invites` / PR #4. Test suite green: typecheck/lint across 7 packages, 160 unit tests, 32 Playwright tests, 144 pgTAP assertions. Mobile verified via Expo web preview smoke. The Phase 3 multi-member deferrals (remove member, removed member loses access) are now E2E-covered. Phase 4.4 also fixed a latent Phase 2 supabase-js auth-callback deadlock (lesson 14).

**Up next:** **Phase 5 — Ideas (CRUD + photo upload).** See `ROADMAP.md`: idea schemas + hooks (follow the `/ideas` + `/ideas-hooks` subpath pattern), Supabase Storage RLS for `idea-photos` (bucket + policies already exist from Phase 1 — verify against the path convention `{group_id}/{idea_id}/{uuid}.{ext}`), web + mobile list/create/detail/edit/status flows, image compression. **OQ-5 (image moderation) should get a decision before this phase ships photo upload.**

**Not yet verified on a real device** (carried over from Phase 2): native mobile Google OAuth + `huddle://` deep-link round-trip (incl. scheme-based invite links); group/invite screens on a native runtime (SecureStore, native navigation, real share sheet / QR scanning). Deferred until an emulator or custom dev build is set up (reasonable Phase 10 item).

---

## 10. On the move from chat to Claude Code

This project ran through Phases 0–2 in Anthropic's chat interface using a "zip and overlay" delivery flow because Claude couldn't write directly to Justin's filesystem. That flow was slow and surfaced a lot of environment-specific bugs only on Justin's machine. Moving to Claude Code eliminates that — you can edit files in `C:\Temp\huddle` directly, run `pnpm typecheck` and `pnpm --filter web test:e2e` yourself, see Metro output, and iterate without round-trips.

The expectation:
- For most tasks, you'll edit files, run commands, and report back with what you did. No need to ask before every edit on routine work in `apps/`, `packages/`, `supabase/migrations/`, `docs/`, etc.
- **Ask first** before: destructive operations (`supabase db reset`, `rm -rf` on anything outside `.next` / `.expo` / `node_modules`), git operations beyond commit (rebases, force pushes, branch deletions), modifying CI config in `.github/`, modifying `supabase/seed.sql` (test data lives there), changing the root `package.json` or `pnpm-lock.yaml` in ways beyond `pnpm install`.
- Don't update the Supabase CLI mid-phase. Don't run `expo install --fix` without confirming first — it can change multiple package versions at once.
- Always show test results after changes (typecheck, lint, relevant unit tests, Playwright if web auth-adjacent, pgTAP if migration-adjacent).
