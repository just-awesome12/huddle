# Architecture — Phase 4 Appendix: Group Invitations

> Companion to `ARCHITECTURE.md`. Covers the Phase 4 (4.1–4.4) design:
> invite RPCs, the three invite paths (link / email / username), deep
> links across the auth wall, username search, and decision log
> D48–D51.

---

## 1. Overview

Phase 4 delivers all three join paths from FR-4 on web and mobile:

| Path         | Created by                                      | Accepted by                                                                   |
| ------------ | ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Open link    | admin (plain INSERT, token from column default) | any authenticated holder of the token                                         |
| Email invite | admin (same, with `invited_email`)              | only an account whose `auth.email()` matches (HD003 otherwise)                |
| By username  | admin via search (same, with `invited_user_id`) | only that user id (HD003 otherwise); surfaced in their "Invites for you" list |

Tokens are 256-bit base64url strings generated **in Postgres**
(`generate_invite_token()`, Phase 1). The planned
`packages/core/invite-token.ts` never needed to exist — there is no
client-side token generation anywhere.

## 2. The two RPCs (D48)

The acceptor is by definition not a member, so RLS blocks every step of
acceptance for them. Phase 0's roadmap assumed Edge Functions; D48
chose SECURITY DEFINER RPCs instead (extends D45): atomic single
transaction, pgTAP-testable, no Deno/serving infra. Edge Functions
debut in Phase 7, where the picker genuinely needs one.

- **`peek_invite(token)`** — for accept pages. Returns group name,
  inviter display name, expiry, and a computed status (`valid` /
  `expired` / `accepted` / `already_member` / `wrong_user`). Possession
  of the token is the capability; nothing else about the group leaks.
- **`accept_invite(token)`** — `SELECT … FOR UPDATE` on the invite
  (concurrent accepts serialise; the loser gets HD002), validates,
  marks accepted, inserts the membership, returns the `groups` row so
  clients can navigate straight in.

**Invite creation needs no RPC.** The creating admin already passes the
SELECT policy, so `INSERT … RETURNING` hands back the DB-generated
token — the create_group problem (D45) does not recur here.

### Error contract

Invite-flow failures raise custom SQLSTATEs so clients map by code,
never by message text:

| Code  | Meaning                                                        | UI copy theme                    |
| ----- | -------------------------------------------------------------- | -------------------------------- |
| HD000 | token not found (incl. revoked — indistinguishable on purpose) | "not valid / ask for a new link" |
| HD001 | expired                                                        | "expired"                        |
| HD002 | already used (single-use)                                      | "already used"                   |
| HD003 | addressed to a different user/email                            | "wrong account"                  |
| HD004 | caller already a member                                        | "you're already in"              |

`inviteErrorKind()` in `@huddle/api-client/invites` is the single
client-side mapper. Revocation is DELETE (Phase 1 RLS design); a
revoked token reads as HD000.

## 3. Deep links across the auth wall

An invite link opened signed-out must survive sign-in/sign-up:

- **Web:** the proxy appends `?next=<pathname>` when bouncing to
  `/sign-in`; the auth forms carry it as a hidden field; the Server
  Action re-validates it (relative path only, no `//`, no `\`) before
  redirecting — open-redirect guard. Sign-in ⇄ sign-up links forward it.
- **Mobile (D49):** GatedStack stashes the intended path in a
  module-scope variable before redirecting to sign-in and resumes it
  once a session exists. Module scope, not state — it must survive the
  re-renders across the auth transition.

## 4. Invite URLs are web links (D50)

Mobile shares `https://<web-origin>/invites/<token>` (origin from
`EXPO_PUBLIC_WEB_URL`, default `http://localhost:3000`), not
`huddle://` links — recipients without the app installed can still
join. `huddle://invites/<token>` resolves to the same screen because
mobile routes mirror web (D46). Universal links (https opens the app
when installed) are a Phase 10 item.

## 5. Username search (4.4)

- `searchProfiles`: prefix `ilike` on usernames, case-insensitive,
  excludes the caller, capped at 10. The query is schema-validated to
  `[a-z0-9_]{1,30}` (no `%`), and `_` is escaped — both layers guard
  the ILIKE pattern.
- **Web** calls it through `GET /api/profiles/search` — auth required +
  per-user sliding-window rate limit (10/min, D51).
- **Mobile** queries Supabase directly (no Turnstile/route-handler
  equivalent exists there); PostgREST-level rate limiting is a Phase 9
  item, noted in code.
- Addressed invites surface in an **"Invites for you"** section on the
  groups list (both platforms). Group names come from `peek_invite` —
  RLS hides the `groups` table from non-members, so the token is the
  only path to the name.

## 6. Decision log D48–D51

| #   | Decision                                                                                                                                              | Rationale                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D48 | Invite acceptance via `peek_invite` / `accept_invite` SECURITY DEFINER RPCs, not Edge Functions; custom HD### SQLSTATEs as the client error contract. | Atomic, pgTAP-tested, no new infra; clients map errors by code. Edge Functions start in Phase 7 where they're unavoidable.                                              |
| D49 | Mobile resumes deep links after auth via a module-scope pending-path stash in GatedStack.                                                             | Equivalent guarantee to the web `?next=` round-trip without inventing query-param plumbing in Expo Router.                                                              |
| D50 | Invites are shared as web URLs built from `EXPO_PUBLIC_WEB_URL`.                                                                                      | Works for recipients without the app; `huddle://` covers in-app routing; universal links in Phase 10.                                                                   |
| D51 | v1 search rate limiting is an in-memory per-user sliding window in the Next route handler.                                                            | Honest stopgap: per-process, so effective limit scales with instances. The perimeter limit is Phase 9 (Cloudflare on /api/\*). Never treat it as the security boundary. |

## 7. Phase 4 gotchas

1. **supabase-js auth-callback deadlock (the big one — fixed in 4.4).**
   `AuthContext`'s `onAuthStateChange` callback awaited a `.from()`
   query. The callback fires while supabase-js holds its auth lock
   (Web Locks API on web), and every data call re-acquires that lock to
   attach the access token → the whole client wedges on a spinner.
   Present since Phase 2; intermittent on web (races hydration);
   impossible on native (no Web Locks) — which is exactly why it
   survived three phases of green test suites. Fix: defer queries out
   of the callback (`setTimeout`). Diagnosis trick that found it:
   `navigator.locks.query()` showing `lock:sb-127-auth-token` held with
   an empty pending list.
2. **Two FKs to the same table need explicit hints in PostgREST
   embeds.** `group_invites` has three FKs to `profiles`; joins must
   name the constraint
   (`profiles!group_invites_invited_user_id_fkey`).

### Verified vs. deferred

- ✅ Web: 32 Playwright tests including two-browser flows (invite →
  accept → admin removes member → access revoked; add-by-username →
  pending invite → accept; ?next= round-trip; 429 rate limit).
- ✅ Mobile: full Expo web-preview smoke of both 4.3 and 4.4 loops.
- ⏸️ True `huddle://` scheme deep link on a native device — carried
  with the other native-runtime items (Phase 10); route mapping is
  verified via the web preview's identical path handling.
- ⏸️ Expired-invite UI card not exercised end-to-end (default expiry is
  7 days); covered by pgTAP (HD001) and the peek status unit mapping.
