# Setup

This document gets a developer from a fresh clone to a running dev environment. If something fails, see [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).

## 1. Prerequisites

| Tool         | Required version | Verify               |
| ------------ | ---------------- | -------------------- |
| Node.js      | ≥ 24.0.0         | `node -v`            |
| pnpm         | ≥ 9.15.0         | `pnpm -v`            |
| Git          | any recent       | `git --version`      |
| Supabase CLI | latest           | `supabase --version` |

For mobile development you will additionally need, in Phase 0 only to _boot the apps_ (not to ship):

- **iOS:** macOS with Xcode 15+ and Command Line Tools (`xcode-select --install`)
- **Android:** Android Studio with an Android 14 (API 34) emulator image
- **Expo Go** app installed on a physical device (optional, fastest dev loop)

If you don't have native tooling yet, you can still run the web app and view the mobile app via Expo Go in Phase 0.

## 2. Install

```bash
git clone <repo-url> huddle
cd huddle
pnpm install
```

## 3. Bootstrap the apps and apply overrides

The apps are scaffolded by official CLIs on first clone, then overridden to consume the shared monorepo configs.

### 3.1 Run the bootstrap script

```bash
./scripts/bootstrap.sh
```

This creates `apps/web` (Next.js 16) and `apps/mobile` (Expo SDK 55).

### 3.2 Override `apps/web/package.json`

After scaffolding, edit `apps/web/package.json` and:

- Add to `dependencies` (workspace links):
  ```json
  "@huddle/api-client": "workspace:*",
  "@huddle/types": "workspace:*",
  "@huddle/validation": "workspace:*",
  "@huddle/core": "workspace:*"
  ```
- Add to `devDependencies`:
  ```json
  "@huddle/config": "workspace:*"
  ```
- Ensure `scripts` includes:
  ```json
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "clean": "rm -rf .next .turbo"
  ```

### 3.3 Override `apps/web/tsconfig.json`

Replace its contents with:

```json
{
  "extends": "@huddle/config/tsconfig/next.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 3.4 Replace `apps/web/eslint.config.mjs`

```js
import config from '@huddle/config/eslint/next';
export default config;
```

### 3.5 Override `apps/mobile/package.json`

Add workspace dependencies the same way as web (`@huddle/api-client`, etc.), plus `@huddle/config` in devDependencies. Ensure scripts include `lint`, `typecheck`, and `clean` parallel to web.

### 3.6 Override `apps/mobile/tsconfig.json`

```json
{
  "extends": "@huddle/config/tsconfig/expo.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

### 3.7 Replace `apps/mobile/eslint.config.mjs`

```js
import config from '@huddle/config/eslint/expo';
export default config;
```

### 3.8 Re-install

```bash
pnpm install
```

## 4. Environment variables

```bash
cp .env.example .env.local
```

For Phase 0 only the file's existence matters. Real Supabase values are needed by Phase 1 when migrations begin. Acquire them by:

1. Create a free Supabase project at <https://supabase.com/dashboard>.
2. Copy the **Project URL**, **anon key**, and **service-role key** from Settings → API.
3. Paste into `.env.local`.

## 5. Verify

All of these must pass before declaring Phase 0 complete:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm --filter web build
pnpm --filter mobile typecheck
```

## 6. Run dev servers

```bash
# Web (http://localhost:3000)
pnpm --filter web dev

# Mobile (Metro bundler; press i for iOS or a for Android)
pnpm --filter mobile start
```

## 7. CI

`.github/workflows/ci.yml` runs `format:check`, `lint`, and `typecheck` on every push and PR to `main`. A green CI run on a throwaway PR is the final Phase 0 checkbox.

## What's next

Phase 1 — database schema and Row-Level Security. See `ROADMAP.md`.
