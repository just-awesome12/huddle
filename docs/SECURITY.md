# Huddle — Security Notes (Phase 9)

Living record of Huddle's security posture: what's enforced in-app today,
the self-test results, and the perimeter/ops work that's deferred until a
domain (OQ-2) and the relevant accounts exist.

Phase 9's objective is to make Huddle costly and unappealing to scrape.
The **primary guarantee is Postgres Row-Level Security** — every table is
member-scoped and verified by pgTAP. Everything else (headers, Turnstile,
Cloudflare) is defence-in-depth on top of that.

---

## 1. In-app defences (shipped)

| Control                           | Where                                                                    | Notes                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Row-Level Security on every table | `supabase/migrations/*`                                                  | The real access boundary. 157 pgTAP assertions across 13 files.                                                                        |
| Security headers                  | `apps/web/next.config.ts`                                                | HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Permissions-Policy, X-Robots-Tag: noindex.              |
| CSP (report-only)                 | `apps/web/next.config.ts`                                                | `Content-Security-Policy-Report-Only`, scoped to self + Supabase + Turnstile. Observe, then enforce with nonces (deferred).            |
| No crawling/indexing              | `apps/web/src/app/robots.ts` + noindex header                            | Private app; `Disallow: /`.                                                                                                            |
| Human verification                | Cloudflare Turnstile on web sign-up                                      | `apps/web/src/components/TurnstileWidget.tsx`, verified server-side in `auth.ts`. Mobile has no Turnstile equivalent (documented gap). |
| Fail-closed prod guards           | `instrumentation.ts` (Turnstile, D38); `send-push` (webhook secret, D65) | Web refuses to boot if the Turnstile bypass is reachable in production; send-push refuses the dev webhook secret outside local.        |
| Search rate limiting              | `apps/web/src/app/api/profiles/search`                                   | In-memory per-user sliding window (D51) — defence-in-depth; the real perimeter limit is Cloudflare (deferred).                         |
| Auth wall                         | `apps/web/src/proxy.ts`                                                  | All non-public routes redirect to sign-in; robots/sitemap/manifest excluded so they serve.                                             |

**Public groups (Phase 12, D79).** Group discovery is a deliberate, scoped
relaxation of the members-only posture — **not a removal of it**. Only the
`groups` SELECT policy widened (to `is_group_member(id) OR visibility =
'public'`); `ideas`, `group_members`, `decisions`, and `group_invites`
keep their `is_group_member()` policies, so a non-member who discovers a
public group sees its **metadata only** (name, description, location, tags,
member count) and **never its contents** — pgTAP asserts this. Discovery
stays **behind the auth wall** (authenticated role only) and the robots
`Disallow: /` / `noindex` are unchanged (a truly-anonymous/SEO-indexed
option was declined). The `/discover` search is a Server-Component
navigation (naturally bounded); a dedicated perimeter rate-limit on it is
deferred with the rest of the Cloudflare work (§5, cf. D51).

---

## 2. Invite-token entropy review (roadmap item)

`generate_invite_token()` (migration `..._group_invites.sql`) produces a
**base64url-encoded 32-byte (`gen_random_bytes`) token — ~256 bits** of
CSPRNG entropy, `UNIQUE`, format-checked (`^[A-Za-z0-9_-]{40,64}$`),
**7-day expiry and single-use**. At 256 bits a token is not enumerable or
brute-forceable, so **no Turnstile is needed on invite creation**. The
roadmap's "add Turnstile if links can be brute-forced" is therefore
resolved as **not required**.

---

## 3. Penetration self-test (executed 2026-06-17, local stack)

| Check                                                                 | Expected | Result                                                                                                                                                                                                       |
| --------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REST request with **no apikey** to `/rest/v1/ideas`, `/groups`        | no data  | **200 `[]`** — falls through to the `anon` role; RLS returns nothing. (Hosted Supabase's Kong returns 401 without an apikey; locally the gate is RLS — both safe, no leak.)                                  |
| `anon` apikey on `decisions` (member-only)                            | empty    | **`[]`**                                                                                                                                                                                                     |
| Cross-group read / role tamper / token replay / decision immutability | denied   | Covered exhaustively by pgTAP (157 assertions): non-member SELECT empty, non-admin role changes rejected, `decisions` INSERT/UPDATE/DELETE denied to clients, used/expired/revoked invites rejected (HD00x). |
| Realtime leakage to non-members                                       | none     | Empirically verified (R-4) — `realtime-rls.integration.mjs`.                                                                                                                                                 |

No data-isolation failures found. The "no auth → 401" expectation from
the roadmap holds at the **production** gateway; locally the equivalent
protection is RLS (verified empty above).

---

## 4. Dependency audit (`pnpm audit`)

As of 2026-06-17: **26 advisories — 4 low, 11 moderate, 6 high, 5
critical.** The high/critical findings are all in the **dev/build
toolchain** (e.g. `vite <=6.4.2` `server.fs.deny` bypass, pulled in via
`vitest`; and the build-time transitive deps of Next/Expo) — **not in the
production runtime dependencies** (`@supabase/supabase-js`,
`@supabase/ssr`, `next` runtime, `react`, `expo` runtime, `zod`,
`@tanstack/react-query`). They do not ship in the deployed bundle.

**Remediation plan (deferred, focused follow-up):** bump the dev-tooling
deps (`vitest`/`vite`/`esbuild` family) together and re-run the full test
gate. Not done inline here because a `vitest`/`vite` major bump can
destabilise the test toolchain mid-phase (cf. CLAUDE.md: don't bump deps
casually). Re-check with `pnpm audit` and `pnpm why <pkg>` for the live
list.

---

## 5. Deferred to perimeter / ops (needs domain + accounts)

> **The working go-live checklist is now `docs/LAUNCH.md`** — it consolidates
> this list with the rest of launch (accounts, deploy, secrets table, mobile,
> assets) and is the single source of truth. The items below stay here for
> their security rationale.

Blocked on **OQ-2 (domain)** and a deployed environment. Track here:

- [ ] **Cloudflare**: move DNS, enable proxy (orange cloud), Bot Fight
      Mode, Security Level: Medium.
- [ ] **Cloudflare WAF**: block known scraper UAs; geo rate-limit if needed.
- [ ] **Cloudflare Rate Limiting**: aggressive limits on `/api/*` + auth.
- [ ] **Production secrets**: real `TURNSTILE_SECRET_KEY` (+ unset test
      mode); real `HUDDLE_WEBHOOK_SECRET` and the deployed `send-push`
      URL for the pg_net triggers (currently dev fallbacks — D65).
- [ ] **Web push (VAPID) keys** (Phase 15, D89): generate a production
      VAPID keypair; set `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` on the
      `send-push` function and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` on the web
      build (committed dev keypair must not ship to prod). Missing keys
      degrade gracefully (web channel off; Expo unaffected).
- [ ] **CSP enforcement**: review report-only violations, switch to
      nonces, then enforce (drop `-Report-Only`).
- [ ] **Sentry**: error monitoring with PII scrubbing (needs DSN).
- [ ] **Terms of Service** forbidding automated access; link from sign-up
      (authorship is OQ-8).
- [ ] **Mobile human-verification**: no Turnstile equivalent on native
      sign-up yet — evaluate App Attest / Play Integrity (post-launch).

---

## 6. Standing secret-handling rules

- Service-role / secret keys are **never** shipped to the client. The
  api-client package is the only seam; `service-role` and `send-push`
  use the key server-side only.
- Local dev uses well-known test keys (Turnstile test pair, the local
  Supabase demo keys, the dev webhook secret). Production must override
  every one of them; the fail-closed assertions (§1) enforce the two
  that would otherwise fail silently.
