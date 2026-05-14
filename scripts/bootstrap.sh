#!/usr/bin/env bash
# =====================================================================
# Huddle — one-time bootstrap script
# =====================================================================
# Scaffolds apps/web (Next.js) and apps/mobile (Expo) using official
# CLIs. Run this ONCE from the repo root after `pnpm install` succeeds
# at the workspace level.
#
# Idempotent: refuses to run if the target app directories already
# contain a package.json.
# =====================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# --- Sanity checks ----------------------------------------------------
command -v pnpm >/dev/null 2>&1 || { echo "pnpm is required"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "node is required"; exit 1; }

NODE_VERSION="$(node -v | sed 's/v//')"
NODE_MAJOR="${NODE_VERSION%%.*}"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node 20+ required (have $NODE_VERSION)"; exit 1
fi

# --- Web (Next.js 16) -------------------------------------------------
if [ -f "$ROOT_DIR/apps/web/package.json" ]; then
  echo "apps/web already exists — skipping web scaffold"
else
  echo "Scaffolding apps/web with create-next-app@latest ..."
  pnpm dlx create-next-app@latest apps/web \
    --typescript \
    --tailwind \
    --eslint \
    --app \
    --src-dir \
    --turbopack \
    --import-alias '@/*' \
    --use-pnpm \
    --no-install \
    --skip-install
fi

# --- Mobile (Expo SDK 55) --------------------------------------------
if [ -f "$ROOT_DIR/apps/mobile/package.json" ]; then
  echo "apps/mobile already exists — skipping mobile scaffold"
else
  echo "Scaffolding apps/mobile with create-expo-app@latest ..."
  pnpm dlx create-expo-app@latest apps/mobile --template tabs --no-install
fi

# --- Post-scaffold instructions --------------------------------------
cat <<'EOF'

============================================================
Bootstrap complete. Next steps:
  1. Apply the overrides documented in docs/SETUP.md §3 to:
       - apps/web/package.json
       - apps/web/tsconfig.json
       - apps/web/eslint.config.mjs
       - apps/mobile/package.json
       - apps/mobile/tsconfig.json
       - apps/mobile/eslint.config.mjs
  2. Run `pnpm install` from the repo root.
  3. Run `pnpm typecheck && pnpm lint` to verify.
  4. Run `pnpm dev` and confirm both apps boot.
============================================================
EOF
