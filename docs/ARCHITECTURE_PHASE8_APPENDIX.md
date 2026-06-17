# Architecture — Phase 8 Appendix (Push Notifications)

Phase 8 delivers mobile push notifications for three events — a new idea
in your group, the picker ran in your group, and you were invited to a
group — with per-user preferences and tap-to-deep-link. It adds Huddle's
**second Edge Function** (`send-push`) and the first use of Postgres
**Database Webhooks** (pg_net).

Shipped as three slices on branch `phase-8-push`:
- **8.1** — `notification_prefs`, pure logic, `send-push`, data layer, tests.
- **8.2** — pg_net trigger fan-out + live verification.
- **8.3** — mobile registration, preferences screen, deep links.

Web does **not** receive push in v1 (deferred).

---

## 1. Shape

```
packages/core/src/notifications.ts        pure: shouldNotify / selectRecipientTokens / buildExpoMessages / chunk
supabase/functions/
  _shared/notifications.ts                 Deno mirror (drift-guarded)
  send-push/index.ts                       the Edge Function (webhook-authed)
  send-push/send_push.integration.mjs      live dry-run probe
supabase/migrations/
  20260617120000_notification_prefs.sql    prefs table + RLS
  20260617130000_send_push_triggers.sql    pg_net AFTER INSERT triggers
packages/api-client/src/
  push.ts / push-hooks.ts                  token register/remove + prefs read/upsert
apps/mobile/src/
  lib/notifications.ts                      permission, token, deep-link helpers (web-guarded)
  components/NotificationsManager.tsx       headless: register on session + route taps
apps/mobile/app/(app)/settings/notifications.tsx   prefs screen
```

The data path: **INSERT** on `ideas`/`decisions`/`group_invites` → AFTER
INSERT trigger → `net.http_post` (async) → `send-push` → reads recipients
as service_role → filters by prefs → POSTs to the Expo Push API.

---

## 2. Decision log (D65–D69)

### D65 — Fan-out via pg_net Database Webhooks, not call-site invocation

An AFTER INSERT trigger on each source table POSTs the new row to
`send-push` via `pg_net` (`net.http_post`). Chosen over invoking
`send-push` from each write seam (run_picker, web Server Actions, mobile
hooks) because it's a **single seam that fires regardless of who wrote
the row** — including mobile-initiated inserts — and any future write
path is covered for free. pg_net is async, so a slow or unreachable
function never blocks (or fails) the INSERT.

`send-push` is the second Edge Function. It is **not user-facing**:
`verify_jwt = false`, and it authenticates with an `x-huddle-webhook-secret`
header instead. Locally the secret falls back to a committed dev value so
no env wiring is needed; **production must set `HUDDLE_WEBHOOK_SECRET`**
and point the trigger at the deployed URL (the trigger currently targets
`host.docker.internal:54321`). This mirrors the Turnstile test-key
posture (D35/D37) and its deferred prod assertion (D38) — Phase 9 adds a
boot check that refuses the dev fallback outside local.

### D66 — `notification_prefs`: absent row means "all enabled"

There is no per-user prefs row until the user changes a setting (the
preferences screen upserts lazily). Both `send-push` and the pure
`shouldNotify` treat a missing row as every event enabled (`DEFAULT_PREFS`).
This avoids touching the `handle_new_user` trigger and keeps the default
behaviour (notify) in one place. RLS scopes the row to its owner;
`send-push` reads it as service_role.

### D67 — A dry-run header makes the function testable without Expo

A request carrying `x-huddle-dry-run: 1` (alongside a valid secret) makes
`send-push` compute recipients + messages and return them **without**
dispatching to Expo. The live probe (`send_push.integration.mjs`) uses it
to assert recipient selection (actor exclusion, opt-out, multi-device),
per-event content, the link/email-invite skip, and secret rejection — all
with zero external calls. Real triggers never send the header, so prod
dispatches normally.

### D68 — Pure notification logic in `@huddle/core` + Deno mirror

Recipient selection, message building, and chunking live in
`@huddle/core/notifications.ts` (dependency-free, exhaustively unit
tested). As with the picker (D62), the Edge Function can't import the
pnpm package, so `supabase/functions/_shared/notifications.ts` is a copy
guarded by a behavioural drift test. `selectRecipientTokens` is the
roadmap's "preference filtering logic": excludes the actor, honours
per-event opt-out, and keeps every device a user has.

### D69 — Mobile-only registration; web-guarded; lifecycle-aware

`expo-notifications` can't mint a token on web and v1 has no web push, so
every entry point in `lib/notifications.ts` no-ops on web (keeps the Expo
web export — our mobile smoke — clean; lesson 3). A device registers its
Expo token once a session exists and removes it on sign-out. `send-push`
prunes tokens Expo reports as `DeviceNotRegistered`. Notification taps
(and cold-start launches) route to the `data.path` deep link carried in
the payload.

---

## 3. Tests

- **Unit:** `@huddle/core` notifications (11, incl. the Deno-mirror drift
  guard); `@huddle/api-client` push (6: token upsert/remove, prefs
  read/upsert). Core total 32, api-client 144.
- **pgTAP:** `notification_prefs` (8: defaults + own-row RLS) and
  `send_push_triggers` (4: the function + three triggers exist). Suite
  total 157.
- **Live `send-push` dry-run probe** (`send_push.integration.mjs`, 9/9):
  selection + payload across all three events + 401 on a bad secret.
- **Live fan-out** (verified via `net._http_response`): an `ideas` INSERT
  produced a `200 {"event":"new_idea"}` from `send-push`; a `decisions`
  INSERT produced `{"event":"picker_ran"}`.
- **Mobile:** Expo web export bundles `/settings/notifications` and the
  notification wiring (web guards hold — lesson 11 bundle smoke).

---

## 4. Carry-forward / deferrals

- **Real-device push delivery is unverified** (and can't be reliably
  automated). Requires a development build with an EAS `projectId`; in
  Expo Go / web preview `getExpoPushTokenAsync` no-ops by design. This is
  the one manual validation step from the roadmap.
- **Production webhook secret + URL** must be configured (D65); Phase 9
  adds the boot assertion against the dev fallback.
- **Debounce/batching** (the roadmap's per-group 60s coalescing) is NOT
  implemented — each INSERT fans out immediately. Acceptable for v1
  volumes; revisit if groups get noisy.
- **Token cleanup job** for long-stale tokens (30+ days) is deferred;
  for now tokens are pruned reactively on `DeviceNotRegistered` and on
  sign-out.
