# Troubleshooting

A growing list of real errors we hit and how we fixed them. If you hit something new, add an entry rather than fix-and-forget.

---

## Install

### Symptom: `ERR_PNPM_UNSUPPORTED_ENGINE` on `pnpm install`

**Cause:** Node version below 24.0.0.
**Fix:** Install Node 24 or newer. With `nvm`: `nvm install 24 && nvm use 24` (the repo's `.nvmrc` pins 24).

### Symptom: `ERR_PNPM_NO_LOCKFILE` on CI

**Cause:** `pnpm-lock.yaml` not committed.
**Fix:** Commit the lockfile. CI uses `--frozen-lockfile` and refuses to install without it.

---

## TypeScript

### Symptom: `Cannot find module '@huddle/config/tsconfig/next.json'`

**Cause:** Workspace packages weren't installed, or `tsconfig` extends path is wrong.
**Fix:**

1. From the repo root: `pnpm install`
2. Confirm `apps/web/tsconfig.json` extends `@huddle/config/tsconfig/next.json` (note `.json` extension is required).

---

## Reset everything (last resort)

If state is corrupted beyond easy diagnosis:

```bash
# from repo root
pnpm clean                              # clears .turbo, dist, build, .next
rm -rf node_modules **/node_modules    # nuke installs
rm -f pnpm-lock.yaml                   # if you suspect lockfile rot
pnpm install
pnpm typecheck
```
