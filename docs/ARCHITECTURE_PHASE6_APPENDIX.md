# Architecture — Phase 6 Appendix: Realtime

> Companion to `ARCHITECTURE.md`. Covers the Phase 6 (6.1–6.3) design:
> the realtime publication, the framework-free subscription helper, the
> web and mobile providers, and decision log D56–D59.

---

## 1. Overview

Phase 6 makes changes to a group's data appear live for connected
members — no polling. The same framework-free subscription helper feeds
two platform providers that invalidate differently:

- **Web** has no client query cache (reads are Server Components, D43),
  so an event triggers a throttled `router.refresh()` — re-running the
  RSCs and refetching.
- **Mobile** holds a TanStack Query cache, so an event invalidates the
  matching query keys.

```
@huddle/api-client/realtime   (framework-free)
   subscribeToGroup / subscribeToMyGroups → RealtimeChange events
        │                                         │
   web RealtimeProvider                     mobile RealtimeProvider
   throttled router.refresh()               invalidateForChange(queryClient)
```

## 2. R-4 closed empirically (the gating result)

The roadmap's highest realtime risk: a channel the client filters but
the server doesn't is a leak. **Verified, not assumed.** A two-user
integration test (`packages/api-client/tests/realtime-rls.integration.mjs`,
needs a live stack) proves that on Postgres Changes:

- a **member** receives their group's row changes (delivery works), and
- an **authenticated non-member** receives **nothing** (RLS enforced).

A service-role control (RLS bypassed) confirmed delivery itself works,
so the non-member's silence is RLS doing its job — not a broken channel.
Conclusion (D56): plain Postgres Changes channels are safe; no
private-channel broadcast workaround needed. The realtime socket must
be authed as the user (`realtime.setAuth(token)`), or it's anon and RLS
blocks everything.

## 3. The publication (6.1)

Migration 014 adds `groups`, `group_members`, `ideas`, `decisions` to
`supabase_realtime` with `REPLICA IDENTITY FULL` so DELETE/UPDATE
payloads carry the old row — `group_id` is then always resolvable for
routing, and Realtime can evaluate the SELECT policy against the old row
on DELETE.

**Gotcha (lesson 18):** Realtime reads publication membership at boot.
Adding tables via migration _after_ `supabase start` delivered no events
until a clean stack restart. Verify with a real subscriber after
changing the publication.

## 4. The helper (6.1)

`@huddle/api-client/realtime`, framework-free:

- `subscribeToGroup(client, groupId, onChange, onStatus?)` — one channel,
  four `postgres_changes` bindings (ideas/group_members/groups/decisions)
  server-filtered by `group_id`. RLS is the real gate; the filter just
  trims noise.
- `subscribeToMyGroups(client, userId, onChange, onStatus?)` — own
  membership rows (joins/removals) + all visible groups (RLS scopes
  `groups` to memberships).
- Normalises payloads to `{ table, eventType, groupId, new, old }` and
  returns an unsubscribe. `onStatus` surfaces channel state for the dot.

## 5. Web provider (6.2)

- `RealtimeProvider` (app shell): owns the browser client + my-groups
  channel; exposes the client, a shared throttle, and connection status
  via context.
- `GroupRealtime` (drop-in client component on group/idea pages):
  subscribes to that group → throttled refresh.
- Throttle: leading + trailing, 500ms, so a burst of events coalesces
  into at most one refresh per window.
- `ConnectionDot` in the header.

**Bug found + fixed (lesson 19):** `RealtimeProvider` was web's first
client-side use of the browser Supabase client, and it threw "URL not
configured." The api-client env helper reads `process.env[key]`
_dynamically_; Next only inlines _static_ `process.env.NEXT_PUBLIC_*`
into client bundles, so the values were undefined in the browser
(server-side was fine — Node has the full env). Fix:
`createBrowserSupabaseClient` accepts a resolved env, and
`apps/web/src/lib/supabase-browser.ts` passes statically-referenced
values.

## 6. Mobile provider (6.3)

- `RealtimeProvider` in the `(app)` layout (signed-in only): owns the
  my-groups channel; each event → `invalidateForChange(queryClient, …)`.
- `useGroupRealtime(groupId)`: per-screen subscription on group/idea
  detail.
- **Reconnect-on-resume:** an `AppState` listener reconnects the socket
  and refetches groups + pending invites on return-to-foreground, so
  state missed while backgrounded is pulled.
- `invalidateForChange` maps table → keys (ideas → group's idea lists;
  group_members → that group's members + my groups + my invites;
  groups → detail + my groups; decisions reserved for Phase 7).
- No env fix needed — the native client already resolves `EXPO_PUBLIC_*`
  for auth, so realtime (same client) connects.

## 7. Decision log D56–D59

| #   | Decision                                                                                                                                                                              | Rationale                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D56 | Realtime uses plain Postgres Changes channels (not private-channel broadcast). RLS enforcement on Postgres Changes verified empirically (R-4).                                        | A member receives, a non-member receives nothing — proven by integration test. Simpler than the broadcast pattern, no extra RLS-on-`realtime.messages` policies. |
| D57 | One framework-free realtime helper; platform providers invalidate differently — web `router.refresh()` (no client cache, D43), mobile TanStack Query invalidation.                    | Keeps the subscription logic shared and react-free; each platform applies its own cache model.                                                                   |
| D58 | Invalidations are throttled (web: 500ms leading+trailing) and subscriptions are scoped (per-group channel + a my-groups channel), never a blanket "refetch everything on any change." | Prevents refetch storms from bursts; keeps live updates targeted.                                                                                                |
| D59 | `createBrowserSupabaseClient` accepts a resolved env; the web app passes statically-referenced `NEXT_PUBLIC_*` so Next inlines them into the client bundle.                           | The dynamic `process.env[key]` helper yields undefined in browser bundles; static refs are the only values Next inlines.                                         |

## 8. Lessons added this phase

- **18 — Realtime reads the publication at boot.** Adding tables to
  `supabase_realtime` after the stack is up delivers no events until a
  clean restart. Re-verify with a live subscriber after publication
  changes.
- **19 — Next inlines only _static_ `process.env.NEXT_PUBLIC_*`.** A
  dynamic `process.env[key]` lookup is undefined in the browser bundle
  (fine server-side, where Node has the full env). Client components
  must reference the vars statically or be handed resolved values.

### Verified vs. deferred

- ✅ Web: 3 two-context Playwright tests (45 total) — dot reaches Live,
  A's idea appears for B with no reload, removed member's page goes 404
  live off the membership event.
- ✅ Mobile: Expo web-preview smoke — one member viewing a group (dot
  SUBSCRIBED) saw a second member's inserted idea appear live (IDEAS
  0→1, no manual refetch).
- ✅ R-4: asserting integration test (member receives, non-member does
  not).
- ⏸️ Reconnect-on-resume exercised by code path, not by a real
  background/resume cycle — that needs a native device/emulator (the
  Expo web preview has no true background state). On the Phase 10
  native-device verification list.
