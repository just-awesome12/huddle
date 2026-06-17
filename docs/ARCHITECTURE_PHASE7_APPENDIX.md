# Architecture — Phase 7 Appendix: Random Picker & Decision History

> Status: **implemented, pending local verification** (branch
> `claude/build-status-question-1321p9`). The Edge Function runtime, the
> migration/pgTAP run, and the web E2E gate require the Supabase
> CLI/Docker/Deno, which the authoring container lacked. Everything the
> JS/TS toolchain can check is green (typecheck, lint, 235 unit tests).

Phase 7 adds the "pick for us" feature: the group can let Huddle choose
one `on_radar` idea at random, and every pick is recorded immutably for a
History view. It introduces the project's **first Edge Function**.

---

## 1. Shape of the feature

- **Pure pick** — `packages/core/src/picker.ts` (`pickOne`,
  `cryptoRandomInt`). Environment-agnostic, exhaustively unit-tested
  (edge cases + uniformity over 60k draws). `cryptoRandomInt` draws from
  Web Crypto and **rejection-samples** to remove modulo bias.
- **Server authority** — `supabase/functions/run-picker` performs the
  pick server-side with a CSPRNG and writes the `decisions` row with the
  **service role**, so a tampering client cannot re-roll or forge a
  result. The `decisions` table has no INSERT policy (Phase 1), so direct
  client INSERTs are impossible.
- **Data layer** — `@huddle/api-client/decisions` (raw `fetchGroupDecisions`
  + `runPicker`) and `/decisions-hooks` (`useGroupDecisions`,
  `useRunPicker`), mirroring the groups/ideas split (D43/D44).
- **UI** — web `PickerPanel` + `/groups/[id]/pick` and `/history`; mobile
  `pick.tsx` + `history.tsx`. Both have a category filter, an optional
  shortlist, a "drumroll" while the pick is in flight, and an animated
  reveal of the winner.

---

## 2. run_picker data flow

```
client (web Server Action / mobile hook)
  → functions.invoke('run-picker', { groupId, category, shortlist })
      gateway: verify_jwt = true  → rejects anon
      fn (user-scoped client, RLS applies):
        auth.getUser()                       → 401 if no/invalid token
        groups.select(id).eq(id)             → 403 if not a member (RLS-hidden)
        ideas.select(id)
             .eq(group_id).eq(status,on_radar)
             [.eq(category)] [.in(id, shortlist)]   ← server-authoritative candidates
        if 0 candidates → 200 { outcome: 'no_candidates' }
        chosenId = pickOne(candidateIds)     ← CSPRNG
      fn (service-role client):
        decisions.insert({ group_id, run_by, chosen_idea_id,
                           candidate_idea_ids, filters })
                 .select(runner + chosen)
      → 200 { outcome: 'picked', decision }
```

Because candidates are read under the **caller's** RLS, the server can
only ever pick from ideas the caller is allowed to see — a tampering
client passing arbitrary `shortlist` ids gains nothing (NFR-2). The
membership gate returns **403** (distinct from the 200 empty state) so
non-members are refused, not silently shown "nothing to pick".

The api-client `runPicker` maps the function's `{ error: { code, message } }`
body (read off `FunctionsHttpError.context`) into a `HuddleError`, so a
403 surfaces as `kind: 'unauthorized'`.

---

## 3. Decision log

### D60 — `decisions.chosen_idea_id` is `ON DELETE NO ACTION` (not RESTRICT)

Phase 5 flagged that the FK was `ON DELETE CASCADE`, so hard-deleting a
chosen idea would erase its history row. The roadmap suggested `RESTRICT`.
**RESTRICT is wrong here**: it is non-deferrable, so deleting a *group*
(which cascades to both its ideas and its decisions in one statement)
would abort the instant the still-referenced idea was removed.

`NO ACTION` defers the check to end-of-statement:

- **Direct** `delete from ideas` of a chosen idea → blocked with `23503`
  (history is immutable; the UI turns this into "dismiss instead").
- **Group/user** deletion → still cascades cleanly, because the
  referencing decision is removed in the same statement, so there is no
  dangling reference by the time the check runs.

Migration `015_decisions_chosen_idea_no_action.sql`. pgTAP `decisions`
suite extended 10 → 12 (chosen idea blocked; candidate-only idea — a
uuid[] array element with no FK — still deletable; group cascade still
works). `deleteIdea`'s doc updated to the 23503 contract.

### D61 — Edge Function vendors the picker rather than importing core

The roadmap intended the Edge Function to import `packages/core`. Reliable
imports from **outside `supabase/`** only landed in recent Supabase CLI
releases (changelog #33613); older pinned CLIs mount only `supabase/`
(the long-standing monorepo limitation, cli#1303). Since the CLI must not
be updated mid-phase, the function vendors a **verbatim copy** of the pick
primitives at `supabase/functions/run-picker/picker.ts`. `packages/core`
remains the unit-tested source of truth; the copy carries a sync header.
The logic is ~30 lines and effectively frozen, so drift risk is minimal.
supabase-js is pulled via an explicit `npm:@supabase/supabase-js@2.47.10`
specifier (no import-map dependency).

---

## 4. Files

```
packages/core/src/picker.ts                     pickOne / cryptoRandomInt (+ tests)
packages/validation/src/picker.ts               pickerOptionsSchema
packages/api-client/src/decisions.ts            fetchGroupDecisions / runPicker
packages/api-client/src/decisions-hooks.ts      useGroupDecisions / useRunPicker
supabase/migrations/015…no_action.sql           FK CASCADE → NO ACTION (D60)
supabase/functions/run-picker/index.ts          Edge Function
supabase/functions/run-picker/picker.ts         vendored pick (D61)
supabase/config.toml                            [functions.run-picker] verify_jwt
apps/web/src/actions/decisions.ts (+ -state)    runPickerAction
apps/web/src/components/PickerPanel.tsx          options + drumroll + reveal
apps/web/src/app/(app)/groups/[id]/pick|history web pages
apps/mobile/app/(app)/groups/[id]/pick|history  mobile screens
```

---

## 5. Verification checklist (run locally before closing the phase)

- [ ] `supabase db reset` — migration 015 applies; `supabase test db`
      passes (pgTAP 144 → 146).
- [ ] `supabase functions serve run-picker` and exercise it: no candidates
      → empty state (no row); 1 candidate → that one; N → uniform over
      ~100 runs; shortlist of 3 → only those 3; non-member → 403.
- [ ] Confirm the **web Server Action** path forwards the user's JWT to
      `functions.invoke` (the gateway needs the user token, not the anon
      key). If not, attach it explicitly in `runPicker`.
- [ ] Web Playwright: run picker → History entry appears → click into the
      chosen idea.
- [ ] Mobile: Metro bundles the new `@huddle/api-client/decisions-hooks`
      subpath (lesson 11), Expo-web smoke of pick + history.
- [ ] Then mark Phase 7 ✅ in `ROADMAP.md`, merge via PR, tag.
```
