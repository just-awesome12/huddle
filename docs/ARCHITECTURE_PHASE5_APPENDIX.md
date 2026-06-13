# Architecture — Phase 5 Appendix: Ideas (CRUD + Photo Upload)

> Companion to `ARCHITECTURE.md`. Covers the Phase 5 (5.1–5.4) design:
> the ideas data layer, web + mobile UI, photo upload pipeline, and
> decision log D52–D55.

---

## 1. Overview

Phase 5 delivers the core content loop on both apps: members post
ideas (title, category, description, link, optional photo), browse a
group's ideas filtered by status and category (FR-10 — the filtered
list IS the history view; no separate page), walk the status flow
(`on_radar → done | dismissed`, reversible), edit, and delete.

No migrations: Phase 1's `ideas` table, enums, constraints, triggers,
RLS, and the `idea-photos` bucket already covered the model.

### Layering (the established pattern, third time)

`@huddle/validation/ideas` (Zod mirrors of DB constraints — including
http(s)-only links, since they render as anchors) →
`@huddle/api-client` `/ideas` (raw, server-safe) + `/ideas-hooks`
(react-query, mobile) → web Server Components/Actions, mobile screens.
List query keys embed the filter combo; `allForGroup` invalidation
clears every combo at once.

## 2. Permissions (D52)

The roadmap's Phase 5 validation assumed RLS would block non-proposers
from editing idea content. Phase 1 deliberately shipped the looser
model — **any member updates any field; the trust boundary is the
group** — and D52 upholds it: no migration, the UI shows edit/delete
controls only to the proposer or an admin as a UX convention. Delete
IS RLS-enforced (proposer or admin). Status changes are intentionally
open to all members. Revisit at the Phase 9 pen test if needed.

## 3. Photo pipeline

```
pick image ──compress client-side──► ≤1MB / ≤1920px JPEG-ish
   web: browser-image-compression (web worker, swaps the compressed
        file back into the form input via DataTransfer)
   mobile: expo-image-picker → expo-image-manipulator (contextual API:
        manipulate → resize → renderAsync → saveAsync base64)
              │
              ▼
   uploadIdeaPhoto (shared):
     1. storage.upload  {group_id}/{idea_id}/{unique}.{ext}
     2. ideas.photo_path = path
     3. remove previous object (replace case)
     — if (2) fails, the orphan from (1) is removed (rollback)
              │
              ▼
   display: createSignedUrl, 1h TTL (private bucket — leaked URLs
   expire; access control is the storage RLS on the path's group_id)
```

Details that matter:

- **Web uploads go through Server Actions as FormData** (D54) — the
  web app still never instantiates a browser Supabase client (D26/D43).
  `serverActions.bodySizeLimit` raised to `4mb` (Next 16 default 1mb).
- **Object lifecycle is manual** (D55): storage objects do NOT cascade
  with rows. `deleteIdea` takes the photo path and removes the object
  after the row delete; replace removes the old object after the swap.
  All removals are best-effort — an orphan in a private bucket beats a
  failed user action.
- **Filenames are non-crypto unique** (`{timestamp36}-{rand36}`):
  uniqueness only matters within one idea's folder, and avoiding
  `crypto.randomUUID` means no RN polyfill (the 4.1 lesson). Mobile
  converts manipulator base64 output with Hermes' built-in `atob`.
- The bucket already enforces 10MB + jpeg/png/webp MIME allow-list
  (Phase 1); the client compresses to ~1MB and both layers re-check
  the content type.

## 4. Moderation (OQ-5 → D53)

**Report-and-review policy for v1, no automated scanning.** Photos are
visible only to group members (auth wall + private bucket + RLS), so
the blast radius of a bad upload is the uploader's own group. The
in-app "report content" mechanism ships with Phase 10 store prep —
Apple requires it for UGC apps regardless. Automated scanning (Hive /
Rekognition) stays on the table if the calculus changes at launch.

## 5. Decision log D52–D55

| # | Decision | Rationale |
|---|---|---|
| D52 | Idea edit permissions keep the Phase 1 model: any member may update any field at the DB; the UI gates edit/delete controls to proposer/admin as UX only. Delete is RLS-enforced. | The trust boundary is the group (logged in Phase 1). Column-level enforcement would need triggers for marginal benefit inside a private group. |
| D53 | OQ-5: report-and-review moderation policy for v1; no automated scanning; report button lands in Phase 10 store prep. | Member-only visibility bounds the risk; zero cost; Apple requires the report mechanism anyway. |
| D54 | Web photo uploads travel through Server Actions as FormData with client-side compression; `bodySizeLimit: 4mb`. | Upholds D26/D43 (no browser Supabase client). Compression keeps bodies ~1MB; 4mb is headroom, not an invitation. |
| D55 | Photo objects are managed manually in upload→point→cleanup order with orphan rollback; `deleteIdea` removes the object; filenames are non-crypto unique. | Storage doesn't cascade; ordering guarantees the row never points at a missing object; no RN crypto polyfill. |

## 6. Phase 7 flag (repeated from 5.1, on purpose)

`decisions.chosen_idea_id` is `ON DELETE CASCADE`. Once the picker
exists, hard-deleting a chosen idea silently erases decision-history
rows — contradicting the append-only history intent. Safe today (the
table is empty until Phase 7). **Revisit the FK in Phase 7** — likely
`RESTRICT` + "dismiss instead" UX. Also flagged in the `deleteIdea`
docstring.

### Verified vs. deferred

- ✅ Web: 42 Playwright tests — CRUD, both filters, status flow,
  `javascript:` link rejection, delete confirm, non-proposer UI gating
  (two-browser), photo upload renders a LOADING signed image,
  guessed-URL fetches rejected, replace/remove.
- ✅ Mobile: Expo web-preview smoke — create → edit (category) → status
  → filters hide/show → delete.
- ⏸️ Mobile photo PICKER untested (can't drive a file dialog headlessly)
  — on the native-device list (Phase 10) with SecureStore and deep
  links. The upload path it feeds is the shared, web-E2E-covered code.
- ⏸️ Smoke-test gotcha worth recording: on the Expo web preview, Expo
  Router keeps underlying screens mounted in the DOM — DOM queries hit
  hidden screens' buttons. Scope to the last match (topmost screen).
