# Documentation Plan

> **Purpose:** Specify every Markdown document the project will produce, what it must contain, when it is written, and how it is kept current.
>
> **Status:** Plan only. Documents are authored during the phases noted below, not all at once up front.

---

## 1. Principles

- **Docs ship with code.** A phase is not complete until its docs are updated.
- **One source of truth per topic.** No duplicated explanations across files; link instead.
- **Audience-first.** Each doc names its reader at the top and writes for that reader only.
- **Markdown, version-controlled, in-repo.** No wikis, no Notion, no Google Docs as primary sources.
- **Examples over prose.** Every "how to" includes a copy-pasteable command or snippet.

---

## 2. Document Inventory

The following files will live under `/docs/` (plus a few at the repo root). Each entry below specifies its audience, contents, authoring phase, and maintenance trigger.

### 2.1 `/README.md` (repo root)

- **Audience:** anyone landing on the GitHub repo for the first time
- **Authored in:** Phase 0
- **Maintained on:** any change to project identity, top-level scripts, or supported platforms
- **Must contain:**
  - One-paragraph product description
  - Status badge(s): CI, license, version
  - Quick-start (≤ 5 commands to a running dev environment)
  - Pointers to `docs/SETUP.md`, `docs/ARCHITECTURE.md`, `ROADMAP.md`, `DOCUMENTATION_PLAN.md`
  - License section
  - Contact / contributing pointer

### 2.2 `/ROADMAP.md` (repo root)

- **Audience:** the builder (you) and any future collaborators
- **Authored in:** pre-Phase 0 (already exists)
- **Maintained on:** every phase completion (check the boxes), every scope change, every resolved open question
- **Must contain:** see the file itself — overview, assumptions, requirements, architecture, stack, phases with checklists, risks, next steps

### 2.3 `/DOCUMENTATION_PLAN.md` (repo root)

- **Audience:** the builder; future maintainers
- **Authored in:** pre-Phase 0 (this file)
- **Maintained on:** any addition or removal of doc files

### 2.4 `/docs/SETUP.md`

- **Audience:** a developer setting up the project from scratch on a new machine
- **Authored in:** Phase 0 (initial), expanded each subsequent phase as new env vars or services are introduced
- **Maintained on:** any new dependency, env var, or external account requirement
- **Must contain:**
  - Prerequisites: Node version, pnpm version, Xcode (for iOS), Android Studio (for Android), Supabase CLI, Cloudflare account (Phase 9+)
  - Step-by-step clone + install + env setup
  - How to create and link a Supabase project
  - How to run migrations locally (`supabase db reset`)
  - How to seed local data
  - How to run the web app (`pnpm --filter web dev`)
  - How to run the mobile app (`pnpm --filter mobile start` + Expo Go vs dev client)
  - How to run a local Edge Function
  - Where each `.env*` file lives, what each variable means, and which are safe to commit (none)
  - Troubleshooting pointer to `TROUBLESHOOTING.md`

### 2.5 `/docs/ARCHITECTURE.md`

- **Audience:** developer onboarding to understand the system
- **Authored in:** Phase 1 (initial DB model section), expanded each phase
- **Maintained on:** any architectural change — new service, new package, new trust boundary
- **Must contain:**
  - High-level topology diagram (ASCII or linked image)
  - Monorepo layout explanation (each `apps/*` and `packages/*` purpose)
  - Data model: tables, relationships, enums, indexes, RLS philosophy
  - Auth flow diagram (sign-up, sign-in, OAuth callback)
  - Realtime architecture
  - Edge Function inventory and what each does
  - Trust boundaries and who enforces what
  - "Why we chose X over Y" decision log section (a running ADR-lite)

### 2.6 `/docs/TESTING.md`

- **Audience:** developer running or extending the test suite
- **Authored in:** Phase 0 (skeleton), expanded each phase as new test types are introduced
- **Maintained on:** any new test framework, test category, or CI step
- **Must contain:**
  - Test pyramid for this project: unit / integration / RLS / E2E
  - How to run each suite locally (commands)
  - How to write a new test for each category (template + example)
  - How CI runs them and what blocks a merge
  - The cross-phase testing gates (mirrors `ROADMAP.md` § 8)
  - Coverage expectations (no hard %, but each new feature must have at least one test)

### 2.7 `/docs/TROUBLESHOOTING.md`

- **Audience:** anyone hitting an error during setup, dev, or deploy
- **Authored in:** Phase 0 (skeleton, ~3 entries), expanded continuously as real issues surface
- **Maintained on:** every real bug or env hiccup encountered — add an entry rather than fix-and-forget
- **Must contain:**
  - Common errors organized by category: install, env, Supabase, Auth, Mobile build, EAS, Vercel, Cloudflare
  - Each entry: symptom (exact error message if available), cause, fix
  - "Reset everything" recipe at the end (kill local Supabase, clear caches, reinstall) — last resort

### 2.8 `/docs/SECURITY.md`

- **Audience:** the builder (security posture review), future auditors
- **Authored in:** Phase 1 (RLS philosophy), expanded in Phase 9 (anti-scraping, pen-test results)
- **Maintained on:** any change to auth, RLS, headers, or external security config
- **Must contain:**
  - Threat model: who are we defending against, what are we protecting
  - Trust boundaries
  - RLS policy summary (table → policy intent)
  - Authentication and session handling
  - Secret management (where keys live, rotation procedure)
  - Anti-scraping measures (Cloudflare rules, Turnstile, rate limits)
  - Pen-test self-test plan and last-run results (Phase 9 deliverable)
  - Incident response notes (who to contact, what to do if a breach is suspected)
  - Responsible disclosure email (when public)

### 2.9 `/docs/CONTRIBUTING.md`

- **Audience:** future you who has forgotten the conventions, or an outside contributor
- **Authored in:** Phase 0 (basics), tightened over time
- **Maintained on:** any change to branch/commit/PR conventions
- **Must contain:**
  - Branch naming (`phase-N/short-description` during build; `feat/`, `fix/`, `chore/` after MVP)
  - Commit message style (Conventional Commits)
  - PR checklist (tests pass, docs updated, regression run)
  - Code style enforcement (ESLint + Prettier; no manual style debates)
  - How to add a new package to the monorepo
  - How to write a migration
  - How to add a new Edge Function

### 2.10 `/docs/RUNBOOK.md` _(authored in Phase 10)_

- **Audience:** on-call you (or whoever is debugging production)
- **Authored in:** Phase 10
- **Maintained on:** every production incident
- **Must contain:**
  - Production URLs and dashboards (Vercel, Supabase, Cloudflare, Sentry, status page)
  - How to read logs in each
  - How to roll back a web deploy (Vercel)
  - How to roll back a mobile release (EAS channels)
  - How to roll back a Supabase migration
  - How to revoke a leaked key
  - Post-mortem template

### 2.11 `/docs/BACKLOG.md`

- **Audience:** the builder
- **Authored in:** Phase 0 (empty file)
- **Maintained on:** continuously — any "great idea" that isn't in the current phase goes here
- **Must contain:** a bulleted list of ideas, each with a one-line rationale. Not a roadmap; just a catch-bin so the current phase stays focused.

---

## 3. Per-User Documentation (deferred)

End-user help (FAQ, how-to-use-the-app guides) is **out of scope for v1**. We will write it once we have real users and real questions. A placeholder `/docs/USER_GUIDE.md` may exist but will be a stub.

---

## 4. Documentation Lifecycle per Phase

Every phase's checklist includes a documentation pass. The pattern:

1. **Before phase starts:** confirm which docs this phase touches (listed in each phase of `ROADMAP.md`).
2. **During phase:** update docs alongside code; the same PR contains both.
3. **Phase completion gate:** PR is not mergeable until the relevant doc sections are updated.
4. **Cross-link:** any new term/concept in one doc must be linked from any other doc that references it.

---

## 5. Diagrams and Visual Assets

- **ASCII diagrams** in the source `.md` files where possible — they render anywhere and version-control diff cleanly.
- **Image diagrams** (only if ASCII is insufficient) stored in `/docs/assets/` as `.png` or `.svg`; source files (e.g., Excalidraw `.excalidraw`) committed alongside.
- **No external diagram services** (Lucidchart, Miro) as the source of truth.

---

## 6. Style and Conventions

- **Sentence case** for headers (not Title Case).
- **Imperative voice** for instructions ("Run …" not "You should run …").
- **Code blocks** specify language for syntax highlighting (` ```bash `, ` ```ts `, ` ```sql `).
- **Relative links** between doc files (e.g., `[Setup](./SETUP.md)`), never absolute URLs to the repo.
- **Tables of contents** required for any doc over ~300 lines.
- **Date format:** ISO 8601 (`2026-05-13`).

---

## 7. Review Cadence

- **End of each phase:** quick pass over `README.md`, `ROADMAP.md`, `ARCHITECTURE.md`, `SETUP.md` to catch drift.
- **End of MVP (post-Phase 10):** full audit. Anything stale, vague, or contradicted by code gets fixed or deleted.
- **Quarterly post-launch:** light pass to catch rot.

---

## 8. What "Done" Looks Like for Documentation at MVP Launch

- [ ] All ten files above (except `USER_GUIDE.md`) exist and are accurate
- [ ] A new developer can clone the repo, follow `SETUP.md` only, and reach a running web + mobile dev environment in ≤ 30 minutes
- [ ] A reader of `ARCHITECTURE.md` alone can explain the trust boundaries and data model
- [ ] `TROUBLESHOOTING.md` has at least 10 real entries gathered during build
- [ ] `SECURITY.md` includes Phase 9's pen-test results
- [ ] No doc contains a TODO, a "coming soon," or a broken internal link
