# LAUNCH.md — Huddle go-live runbook

Single consolidated checklist for taking Huddle to production (web + mobile).
Supersedes the scattered launch notes in `docs/SECURITY.md` §5 and the
ROADMAP "Remaining Phase 10" section — those stay as context; **this is the
working list.**

**Status headline:** the application is feature-complete and tested
(typecheck/lint/format green; unit core 48 / validation 111 / api-client 231;
pgTAP 345; Playwright 85; 5 live edge/realtime probes). What remains for
go-live is **operational/external** — accounts, a domain, deployment, legal
copy, store review, and real-device verification — not application code.

Legend: 🔒 = only Justin can do (account/decision/legal) · 🛠️ = Claude can
prep/automate · ⏳ = needs a prior item first.

---

## Tier 1 — Blockers only you can unblock

- [ ] 🔒 **Register a domain** (OQ-2). The keystone — unblocks the Vercel
      custom domain, Cloudflare perimeter, mobile deep/universal links, the
      email **sending domain** (DKIM for the digest + auth mail), and prod
      Turnstile.
- [ ] 🔒 **Terms of Service + Privacy Policy copy** (OQ-8). Required for
      app-store review and the sign-up ToS link. Public `/terms` + `/privacy`
      routes already exist (Phase 10) — they need real legal text.
- [ ] 🔒 **Apple Developer account** ($99/yr) — iOS submission + APNs push.
- [ ] 🔒 **Google Play Developer account** ($25 one-time) — Android submission.
- [ ] 🔒 **Resend account** (email) — then verify the domain (DKIM/SPF). Can
      double as the Supabase Auth SMTP provider.
- [ ] 🔒 **Supabase region** (OQ-7) — pick single- vs multi-region before
      creating the prod project.

---

## Tier 2 — Deploy + provision the backend/web (needs Tier 1)

### Production Supabase project

- [ ] ⏳ Create the prod project (region = OQ-7); link the CLI.
- [ ] 🛠️ Push all migrations (through **042**): `supabase db push`. Do **not**
      run `seed.sql` (test data).
- [ ] 🔒 Auth → Google OAuth: set `client_id` / `secret`; `site_url` = prod
      web URL; `additional_redirect_urls` for the prod domain + `huddle://**`.
- [ ] 🔒 Auth → email: set the **`magic_link` template to render `{{ .Token }}`**
      (the 6-digit OTP, D94) and flip **`enable_confirmations` on** (D30).
- [ ] 🛠️ Deploy the 4 Edge Functions: `run_picker`, `send-push`,
      `send-digest`, `delete-account` (`supabase functions deploy`).
- [ ] ⏳ **pg_cron** jobs (`inactivity-nudges`, `weekly-digest`) are created by
      the migrations — verify `select * from cron.job;` on prod and that
      `cron.database_name` matches the app DB.

### Production secrets / env (the consolidated source of truth)

**Edge Function secrets** (`supabase secrets set ...`):

| Secret                                   | Used by                | Notes                                                                                                                                          |
| ---------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `HUDDLE_WEBHOOK_SECRET`                  | send-push, send-digest | Strong random; the pg_net triggers + cron must send the same value. Replaces the dev fallback (D65). Boot **fails closed** without it in prod. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | send-push              | Prod web-push keypair (D89). Missing → web push degrades off (Expo unaffected).                                                                |
| `VAPID_SUBJECT`                          | send-push              | `mailto:` contact for the push service.                                                                                                        |
| `RESEND_API_KEY`                         | send-digest            | Resend key (16e/D104). Missing → digest logs + no-ops.                                                                                         |
| `RESEND_FROM`                            | send-digest            | e.g. `Huddle <digest@yourdomain>` — must be on the verified domain.                                                                            |
| `DIGEST_APP_URL`                         | send-digest            | Prod web base for email links (default `https://huddle.app`).                                                                                  |

**Vault secrets** (SQL: `select vault.create_secret('<value>','<name>')`) — so
the pg_cron jobs + DB-webhook triggers reach the deployed functions:

| Vault name         | Value                                                            |
| ------------------ | ---------------------------------------------------------------- |
| `send_push_url`    | `https://<ref>.supabase.co/functions/v1/send-push`               |
| `send_digest_url`  | `https://<ref>.supabase.co/functions/v1/send-digest`             |
| `send_push_secret` | same value as `HUDDLE_WEBHOOK_SECRET` (reused by both functions) |

**Web (Vercel) env:**

| Var                                     | Notes                                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`              | prod project URL                                                                                                 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`  | prod publishable key                                                                                             |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`        | **real** Cloudflare site key                                                                                     |
| `TURNSTILE_SECRET_KEY`                  | **real** secret; **unset** `NEXT_PUBLIC_TURNSTILE_TEST_MODE` (boot fails closed if test mode is on in prod, D38) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`          | matches the send-push `VAPID_PUBLIC_KEY`                                                                         |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | enables Sentry (DSN-gated)                                                                                       |

### Edge / perimeter

- [ ] ⏳ **Deploy web to Vercel** (custom domain + the env above).
- [ ] 🔒⏳ **Cloudflare**: move DNS, enable proxy (orange cloud), Bot Fight
      Mode, Security Level Medium; **WAF** (block scraper UAs); **Rate
      Limiting** on `/api/*` + auth (D51 in-app limiter is defence-in-depth
      only).
- [ ] 🛠️⏳ **CSP**: review report-only violations → nonces → enforce (drop
      `-Report-Only`).
- [ ] 🔒 **Sentry**: project + DSN (PII scrubbing).

---

## Tier 3 — Mobile build + submit (needs Apple/Google accounts)

- [ ] 🛠️🔒 EAS build config + a real **`projectId`** in `app.json` (also
      unblocks real push delivery + on-device verification).
- [ ] 🔒 iOS **APNs** key + Android **FCM** credentials for real push
      (currently Expo dev push).
- [ ] 🔒 App Store / Play listings (screenshots, description, privacy
      questionnaire) → TestFlight / Play internal testing → review → submit.

---

## Tier 4 — Assets

- [ ] 🔒 App **icon + splash** master (square source image); generate the
      platform sizes.

---

## Tier 5 — Real-device verification (needs an EAS/dev build)

Carried over as unverified on real hardware:

- [ ] Native Google OAuth + `huddle://` deep-link round-trip (incl.
      scheme-based invite links).
- [ ] Real push delivery (APNs/FCM) end-to-end.
- [ ] Native runtime: SecureStore, share sheet, QR scan, photo picker,
      realtime reconnect across a real background/foreground cycle.

---

## Not blockers (deferred niceties)

Web loading skeletons (lesson 21), web per-event notification-prefs UI,
one-click email unsubscribe link, a single aggregating digest RPC (vs
per-user reads) for scale, mobile human-verification (App Attest / Play
Integrity).

---

## Shortest path to a usable launch

A **web beta** is much closer than the app stores:

1. Domain (Tier 1) → 2. prod Supabase + migrations + auth config (Tier 2) →
2. Vercel deploy + env → 4. Cloudflare + ToS copy.

That's a live, secured web app. The **mobile store path is the longest pole**
(developer accounts + store review + real-device verification) and can follow.
