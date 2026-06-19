# Architecture — Phase 7 Appendix (Random Picker & Decision History)

Phase 7 adds the "pick for us" feature: a server-authoritative random pick
over a group's on-the-radar ideas, with category/shortlist filters, an
animated reveal on both apps, and a permanent decision history. It also
stands up **Huddle's first Edge Function** (`run_picker`).

Shipped as three slices on branch `phase-7-picker`:

- **7.1** — FK migration, pure picker logic, `run_picker` Edge Function,
  decisions data layer, tests.
- **7.2** — web picker UI + decision history.
- **7.3** — mobile picker UI + decision history.

---

## 1. Shape

```
packages/core/src/picker.ts          pure pick/shuffle (injectable RNG, unbiased)
supabase/functions/
  _shared/picker.ts                  Deno mirror of @huddle/core picker (drift-guarded)
  _shared/cors.ts                    shared CORS headers
  run_picker/index.ts                the Edge Function
  run_picker/run_picker.integration.mjs   live probe (not in vitest)
supabase/migrations/
  20260616120000_decisions_chosen_idea_restrict.sql   FK CASCADE → NO ACTION
packages/api-client/src/
  decisions.ts                       fetchGroupDecisions, runPicker, PickerError
  decisions-hooks.ts                 useGroupDecisions, useRunPicker
packages/validation/src/picker.ts    runPickerSchema
apps/web/src/
  actions/picker.ts                  runPickerAction (Server Action → Edge Fn)
  components/PickerClient.tsx         client picker + reveal
  app/(app)/groups/[id]/picker/      picker page
  app/(app)/groups/[id]/history/     decision history page
apps/mobile/app/(app)/groups/[id]/
  picker.tsx                         picker screen + reveal
  history.tsx                        decision history screen
```

The `decisions` table itself shipped in Phase 1 (migration 010), already
in the realtime publication (migration 014) — so **history is live for
free** on both apps via the existing realtime providers.

---

## 2. Decision log (D60–D64)

### D60 — The pick runs in an Edge Function (`run_picker`), not an RPC

The pick must be made server-side with a CSPRNG so a tampering client
can't re-roll until it likes the answer, and the resulting `decisions`
row must be written authoritatively — `decisions` has **no INSERT RLS
policy** (migration 010), so only a `service_role` writer can record a
run.

We chose an **Edge Function** over a SECURITY DEFINER RPC (the D45/D48
pattern), even though both could satisfy the security property:

- The roadmap and D48 both earmarked the picker as the first Edge
  Function, and **Phase 8 (push) needs Edge Function infra regardless** —
  so this stands up the toolchain where it's first useful instead of
  deferring it.
- `[edge_runtime]` + `[functions.run_picker]` (with `verify_jwt = true`)
  were added to `config.toml`. After any change to those blocks the local
  stack must be restarted (`supabase stop && supabase start`) for the
  edge runtime to serve the function.

Flow inside the function:

1. Authenticate the caller from the forwarded `Authorization` header
   (a **user-scoped** supabase-js client).
2. Confirm membership explicitly (→ `403 forbidden` for non-members,
   distinct from "no candidates").
3. Read candidate ideas through the _user-scoped_ client so RLS bounds
   the pool to what the caller can already see; filter to `on_radar`,
   then by category, then intersect with the optional shortlist.
4. Pick one with the shared unbiased picker.
5. Insert the `decisions` row with a **service-role** client.

Error contract is a JSON `{ error }` body, mapped by the client:
`bad_request | unauthorized | forbidden | too_few_candidates | internal`.

### D61 — `decisions.chosen_idea_id`: CASCADE → **NO ACTION** (not RESTRICT)

Carried flag from Phase 1/5: the FK was `ON DELETE CASCADE`, so hard-
deleting a chosen idea would silently erase the history row.

We needed two things at once: (a) a _direct_ hard-delete of a chosen idea
must fail (preserve history → "dismiss instead"), and (b) deleting the
whole _group_ must still cascade everything away.

`NO ACTION` — not the roadmap-suggested `RESTRICT` — is the correct tool.
Both raise SQLSTATE 23503 for (a), but they differ on (b):

- `RESTRICT` checks **immediately** when the idea row is deleted. During
  a group-delete cascade the idea can be removed before the decision that
  references it, so `RESTRICT` would abort the whole group delete.
- `NO ACTION` **defers** the check to end-of-statement. The group cascade
  removes the referencing decision (via `decisions.group_id` CASCADE)
  within the same statement, so there's no referrer at check time and the
  group delete succeeds.

pgTAP proves both: a chosen idea can't be deleted directly (23503), yet
deleting the group still cascades its decisions away. The apps catch
23503 on delete and steer to "dismiss instead."

(`candidate_idea_ids` is a `uuid[]` with no FK — a non-chosen candidate
can still be deleted, leaving a dangling id in the array. Intentional:
the array records what was on the table at decision time.)

### D62 — Pure picker in `@huddle/core` + a drift-guarded Deno mirror

Pick/shuffle logic lives in `packages/core/src/picker.ts`: framework-free,
with randomness injected as a `RandomUint32` so it's deterministic under
test (production passes a Web Crypto CSPRNG source). Index selection uses
**rejection sampling**, not `rand() % n`, to avoid modulo bias — over a
trust-bearing history "slightly biased" is unacceptable.

Edge Functions run on Deno and can't import the pnpm workspace package, so
there's a deliberate copy at `supabase/functions/_shared/picker.ts`. A
**behavioural drift guard** in `packages/core/tests/picker.test.ts`
imports both modules and runs them through the same injected RNG, so the
copy can't silently diverge.

### D63 — Require **≥ 2 candidates** (divergence from the roadmap)

The roadmap's validation list says "1 candidate → that one is picked." We
instead require at least two candidates after filtering; a single
candidate returns `422 too_few_candidates`. Running a random picker over
one option is a meaningless no-op that would only confuse ("why did it
make me _pick_ the only idea?"). Both clients mirror the server's
candidate computation to **disable the run button** below the threshold,
so the 422 is a backstop, not the primary UX. The server remains
authoritative.

### D64 — Web invokes via a Server Action; mobile via the hook

Upholding D26/D43 (web never calls Supabase from the browser), the web
picker calls `runPickerAction` (a Server Action) rather than invoking the
Edge Function client-side. The action calls `getUser()` first so the ssr
client hydrates the session and `functions.invoke` forwards the caller's
JWT to the function. Mobile uses `useRunPicker` on the native client,
whose realtime/functions auth is kept in sync automatically.

---

## 3. Tests

- **Unit:** `@huddle/core` picker (10, incl. unbiased rejection sampling,
  empty/single/permutation edge cases, and the Deno-mirror drift guard);
  `@huddle/api-client` decisions (9, incl. `runPicker` body shaping and
  the `PickerError` mapping from a `FunctionsHttpError`); validation 77.
- **pgTAP:** `decisions.sql` now 11 assertions (added: chosen idea can't
  be hard-deleted directly; group delete still cascades). Suite total 145.
- **Live Edge Function probe:** `run_picker.integration.mjs` (run against
  a live stack) — happy path + service-role insert, 403 non-member, 422
  single-candidate, shortlist narrowing, and the NO ACTION FK block. 9/9.
- **E2E (web):** `picker.spec.ts` (3) — pick → result → recorded in
  history; sub-2-candidate category disables the run; chosen idea refuses
  hard-delete with the dismiss message. Web suite total 48.
- **Mobile:** Expo web export bundles `/groups/[id]/picker` and
  `/groups/[id]/history` (Metro resolves the new `decisions*` subpaths —
  lesson 11 bundle smoke).

---

## 4. Carry-forward

- `run_picker` is the template for Phase 8's push Edge Function(s); the
  `[edge_runtime]`/`[functions]` config and `_shared/` convention are now
  in place.
- Not yet verified on a real device: native `functions.invoke` auth
  forwarding for `run_picker` (web E2E proves the server path; native
  relies on the same supabase-js auth-sync that powers realtime).
- The reveal animation is a JS-timer "spin" (no Reanimated dependency);
  revisit if a richer drumroll is wanted.
