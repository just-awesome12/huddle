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
| Web | Next.js 16 (App Router) + Tailwind v4 | Server Actions for auth mutations |
| Mobile | Expo SDK 55 + React Native + Expo Router | File-based routing mirrors App Router |
| Backend | Supabase (Postgres + Auth + RLS + Realtime + Storage) | Local stack via `supabase start` |
| Auth | Email/password + Google OAuth | Apple deferred (needs developer account) |
| Anti-scraping | Cloudflare Turnstile (web) + auth wall + Cloudflare proxy | Mobile has no Turnstile equivalent |
| Push | Expo Push v1 | Real APNs/FCM later |
| Web E2E | Playwright | 16 tests, all passing |
| Mobile E2E | Maestro (deferred to Phase 9) | Not set up yet |
| Unit | Vitest | 37 (validation) + 50 (api-client) = 87 |
| RLS | pgTAP | 120 assertions across 9 files |

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
  migrations/   SQL migrations (11 so far)
  tests/        pgTAP tests
  seed.sql      Test users + seed group
  config.toml   Local Supabase config
docs/
  ARCHITECTURE.md
  ARCHITECTURE_PHASE2_APPENDIX.md   ← full Phase 2 design + decision log
ROADMAP.md     ← phase plan (Phase 2 = ✅ COMPLETE)
SETUP.md       ← env setup
```

### Subpath import conventions

- Web imports Supabase only via `@huddle/api-client/{browser,server,service-role,errors,turnstile}`
- Mobile imports Supabase only via `@huddle/api-client/{native,errors}`
- Apps **never** import from `@supabase/*` directly — types like `Session`, `User`, `SupabaseClient` are re-exported through the api-client `/native` and `/server` subpaths

---

## 3. What's shipped (Phases 0–2)

**Phase 0** — Monorepo scaffold, Next.js 16 + Expo SDK 55 apps, 5 shared packages, Supabase config, GitHub Actions CI. Repo: `github.com/just-awesome12/huddle`.

**Phase 1** — Full DB schema and RLS. 8 tables + 1 storage bucket, enums, helpers (`is_group_member`, `is_group_admin`), `handle_new_user` trigger, last-admin enforcement, 120 pgTAP assertions. Decisions table is append-only. Profiles publicly readable to authenticated users.

**Phase 2** — Authentication. Email/password + Google OAuth on both web and mobile. Web uses Server Actions + a proxy (`apps/web/src/proxy.ts`, renamed from middleware per Next 16). Mobile uses a React Context (`AuthProvider`) + `GatedStack` redirect logic in `app/_layout.tsx`. Onboarding flow for OAuth users. Cloudflare Turnstile on web sign-up with test-mode bypass for E2E. **Full architecture in `docs/ARCHITECTURE_PHASE2_APPENDIX.md` — read that before doing any auth work.**

The Phase 2 close point is tagged `phase-2-complete`.

---

## 4. Decision log (D1–D42)

D1–D25 from earlier phases are captured in the main `ARCHITECTURE.md`. D26–D42 are in `ARCHITECTURE_PHASE2_APPENDIX.md`. Highlights that affect ongoing work:

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

---

## 6. Working norms

- **Small slices.** Even small features ship in sub-phases (e.g., Phase 2 became 2.1 through 2.7). Each sub-phase has an explicit test gate.
- **Tests before "done."** Unit/integration tests for shared packages. Playwright for web flows. pgTAP for RLS regressions. Manual smoke for mobile (Maestro deferred to Phase 9).
- **Honest documentation of deferrals.** When something can't be done now (Apple OAuth, native mobile OAuth verification, Maestro), capture WHY in the roadmap rather than pretending it's complete.
- **Architecture decisions get a log entry.** Numbered (continue from D42), one-line summary, with rationale captured wherever it's relevant (often in the architecture appendix).
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

These shouldn't block Phase 3 work but should get answered before Phase 10.

---

## 9. Status: where you're starting

**Just closed:** Phase 2 (Authentication). Tag: `phase-2-complete`. Test suite green: typecheck/lint across 7 packages, 87 unit tests, 16 Playwright tests, 120 pgTAP assertions.

**Up next:** **Phase 3 — Groups & Membership.** See `ROADMAP.md` for the planned tasks. The first slice (Phase 3.1) will likely be the Zod schemas in `packages/validation` and the basic hooks in `packages/api-client`. The "You're signed in" placeholder home screen on web and mobile gets replaced with the real group list as part of this phase.

**Not yet verified on a real device** (carried over from Phase 2): native mobile Google OAuth + `huddle://` deep-link round-trip. Deferred until an emulator or custom dev build is set up (reasonable Phase 10 item).

---

## 10. On the move from chat to Claude Code

This project ran through Phases 0–2 in Anthropic's chat interface using a "zip and overlay" delivery flow because Claude couldn't write directly to Justin's filesystem. That flow was slow and surfaced a lot of environment-specific bugs only on Justin's machine. Moving to Claude Code eliminates that — you can edit files in `C:\Temp\huddle` directly, run `pnpm typecheck` and `pnpm --filter web test:e2e` yourself, see Metro output, and iterate without round-trips.

The expectation:
- For most tasks, you'll edit files, run commands, and report back with what you did. No need to ask before every edit on routine work in `apps/`, `packages/`, `supabase/migrations/`, `docs/`, etc.
- **Ask first** before: destructive operations (`supabase db reset`, `rm -rf` on anything outside `.next` / `.expo` / `node_modules`), git operations beyond commit (rebases, force pushes, branch deletions), modifying CI config in `.github/`, modifying `supabase/seed.sql` (test data lives there), changing the root `package.json` or `pnpm-lock.yaml` in ways beyond `pnpm install`.
- Don't update the Supabase CLI mid-phase. Don't run `expo install --fix` without confirming first — it can change multiple package versions at once.
- Always show test results after changes (typecheck, lint, relevant unit tests, Playwright if web auth-adjacent, pgTAP if migration-adjacent).
