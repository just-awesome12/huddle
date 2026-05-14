# Huddle

Group-based idea sharing for events, activities, food, and places. When the group can't agree, the random picker decides.

> **Status:** in active development — Phase 0 complete. See [`ROADMAP.md`](./ROADMAP.md) for current phase and what's coming.

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Scaffold the apps (one-time, only on a fresh clone)
./scripts/bootstrap.sh

# 3. Apply post-scaffold overrides (see docs/SETUP.md §3)

# 4. Copy env template and fill in Supabase values
cp .env.example .env.local

# 5. Verify the toolchain
pnpm lint && pnpm typecheck && pnpm format:check

# 6. Start dev servers
pnpm dev
```

## Project layout

```
apps/web        — Next.js 16 web app
apps/mobile     — Expo SDK 55 mobile app (iOS + Android)
packages/types       — shared TypeScript types
packages/validation  — shared Zod schemas
packages/api-client  — Supabase client wrapper
packages/core        — pure business logic (picker, invites)
packages/config      — ESLint, Prettier, tsconfig presets
supabase/       — DB migrations, Edge Functions, local config
docs/           — full documentation set
```

## Documentation

- [`ROADMAP.md`](./ROADMAP.md) — phases, testing gates, risks
- [`DOCUMENTATION_PLAN.md`](./DOCUMENTATION_PLAN.md) — what each doc contains and when it's written
- [`docs/SETUP.md`](./docs/SETUP.md) — full setup walkthrough
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — system design (expanded in Phase 1)
- [`docs/TESTING.md`](./docs/TESTING.md) — test strategy and how to run each suite
- [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) — common errors and fixes
- [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) — conventions and workflow

## License

Not yet chosen. See open question OQ-11 in `ROADMAP.md`. Until a license is added, all rights reserved.
