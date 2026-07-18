# Plans Authoring Convergence — Phase 3 Bridge Report: Plans Integration

**Status:** Conditionally approved, corrective packet applied, still
**unmerged** on `feat/plans-authoring-convergence-packet-audit` (draft PR
[#148](https://github.com/Fine-Diet/fine-diet-platform/pull/148)). Gate 3 of
the Fine Diet Plans Authoring Convergence execution packet (doc
`e742593a-3d7c-423b-9221-2d697df56f5a`), building on Gate 1 (audit) and Gate 2
(`PLANS-AUTHORING-CONVERGENCE-PHASE2-COMPOSER.md`, shared composer engine).

**Review history:**
- Initial implementation: commit `6266c72`.
- Conditional approval + required corrective packet (macro compatibility,
  test-count correction, branch/PR exposure, browser QA gate): see §12 below.
  Corrective commit: `581023f` (see §12).

Phase 3 remains **unmerged** pending the authenticated browser-QA pass (§7,
§12) — no gate in this document should be read as "ready to merge."

---

## 0. TL;DR

Wired the Phase 2 shared Meal Composer into the dated Plans day surface
(`pages/journal/plans/day/[date].tsx`) as an **additional, explicit
alternative** to the existing `SlotEditor` — never a replacement. A new
component, `PlanMealComposerPanel`, wraps the composer in two new modes:

- `plan` (existing, Phase 2 contract) → **create** a new planned meal.
- `plan-edit` (new this phase) → **edit** an existing **pending** planned
  meal's structure.

Both write to `planned_meals` only, through the pre-existing
`planService.createMeal`/`updateMeal` client calls and their unmodified API
routes/server functions. Neither path creates a journal entry, calls the
in-memory logging route, or implicitly saves a `MealDocument`. The canonical
conversion is `lib/meals/adapters.ts`'s `plannedMealToMealDocument` (read,
already existed) and a new inverse, `mealDocumentToPlannedMealPayload` (write)
— no second planned-meal component schema was introduced.

The existing saved-template picker, imported-draft picker, and manual
totals-only form (`SlotEditor`) are **completely unmodified** — they remain
the default entry point; the composer is a toggle-in alternative. Only
pending planned meals are reachable through the new edit path, enforced at
three independent layers (UI gating, a redundant client guard in the new
panel, and the existing server-side check) — none of which this phase had to
add, only reuse.

**14 new tests** in the initial implementation (adapter round-trips +
composer contract config; the report originally, incorrectly, said 38 — see
§12.3 for the correction), **+21 more** in the macro-compatibility corrective
packet (§12), for **35 new tests** total. Full test run as of the corrective
commit: **2241 passed / 4 failed** across **193 suites**, the same 4
pre-existing, unrelated failures as the Phase 2 baseline (`lib/programs`
marketing composition + `/programs/[series]` — no file in this phase touches
`lib/programs`). `tsc --noEmit` is clean on all non-test source. A full
production build (`next build`) succeeds, compiling the modified day page and
the new component end-to-end.

**Browser QA — still an open blocker, please read §7 and §12.4.** I do not
have an interactive browser tool in this environment, and this app's local
dev server requires a real authenticated Supabase session that
`curl`/`WebFetch` can't establish. I verified everything I could without one
(production build, route compilation, and a full code-trace of every write
path against the exact server-side guards), but I have **not personally
clicked through** add / edit / move / copy / execute / Adjust & Log in a
browser. This gate has **not** passed and this packet stays in
`needs_review` until a human with a live session runs the click-path in §7.

---

## 1. Exact Plans surfaces migrated

Only one page changed, and only its two inline-editor render blocks:

`pages/journal/plans/day/[date].tsx`:
- The "Edit plan" flow (`editingMeal` block, was `SlotEditor` only) now also
  offers "Edit ingredients →", which swaps in `PlanMealComposerPanel`
  (`mode="edit"`).
- The "Add meal to this slot" flow (`creatingSlot` block, was `SlotEditor`
  only) now also offers "Build with ingredients →", which swaps in
  `PlanMealComposerPanel` (`mode="create"`).
- Both toggles default to **off** (existing `SlotEditor` shown first) and
  reset to off whenever a different meal/slot is opened
  (`handleEdit`/`handleAdd`), so there's no session-carryover surprise.

No other Plans page (`week.tsx`, `today.tsx`, `grocery/[planId].tsx`, the
imports pages, `ScheduleConflictBanner`, `DayView.tsx`, `SlotCard.tsx`) was
touched. Move, copy, "Log as planned"/"Skip", "Adjust & log", Undo, day
templates, and week patterns are all rendered by code blocks this phase did
not edit — confirmed by `git diff --stat` showing zero changes to
`SlotCard.tsx`, `DayView.tsx`, `planServerService.ts`, or any `execute`/`move`/
`copy` route.

---

## 2. Create and edit write paths

Both go through the **existing** client service and **existing**, unmodified
API routes/server functions — nothing new was added at the persistence layer:

| Action | Client call | Route | Server function |
|---|---|---|---|
| Create | `planService.createMeal({ plan_id, plan_day_id, plan_slot_id, name, meal_type, payload })` | `POST /api/journal/plans/meals` | `insertPlannedMeal` |
| Edit (pending only) | `planService.updateMeal(meal.id, { name, meal_type, payload })` | `PATCH /api/journal/plans/meals/:mealId` | `updatePlannedMeal`, gated by `assertPendingForRecovery` |

These are the exact same calls `SlotEditor`'s `handleSaveCreate`/`handleSaveEdit`
already make in the day page — `PlanMealComposerPanel` only supplies a
different-shaped `payload` (component-level, food-search-grounded) instead of
totals-only. Both routes persist `payload` as opaque JSON
(`Record<string, unknown>`); neither enforces `PlannedMealItemSchema`/
`PlannedMealPayloadSchema` (`lib/plans/validators.ts` — confirmed by reading
both route handlers; that Zod schema is only exercised by AI-authored content:
plan generation and imports). Server-side NDS recompute
(`recomputeMealNDSShape`) and `recomputePlanDayProjection` already run
unconditionally in both routes — unchanged, and correctly re-derive the
day's badges from whatever payload the composer sends.

No call to `logInMemoryMealDocumentForPerson`, `createEntry`, or any
`/documents/*` route exists anywhere in `PlanMealComposerPanel` — plan-mode
authoring cannot create a journal entry (see §6 for how this was confirmed).

---

## 3. Canonical conversion, both directions

`lib/meals/adapters.ts` — no new schema, both directions reuse the
already-existing `MealComponent`/`MealDocument` contract:

- **Read (init edit):** `plannedMealToMealDocument(meal)` — already existed
  from Phase 2 (built for `PlannedMealAdjustComposer`), reused verbatim.
- **Write (submit, both create and edit):** `mealDocumentToPlannedMealPayload(doc)`
  — new this phase. Internally calls `recomputeMealNutrition(doc.components)`
  (the exact same deterministic recompute the composer reducer already ran
  after every edit) to get each component's *scaled contribution*, then:

```typescript
export function mealDocumentToPlannedMealPayload(doc: MealDocument): PlannedMealPayload {
  const recompute = recomputeMealNutrition(doc.components);
  const items = doc.components.map((component, i) =>
    componentToPlannedMealItem(component, recompute.components[i]?.nutrition ?? null),
  );
  return {
    items,
    totals: { calories: recompute.totals.calories ?? 0, ...macrosToSnakeTotals(recompute.totals.macros) },
    ...(doc.prep_notes?.trim() ? { notes_md: doc.prep_notes.trim() } : {}),
  };
}
```

A subtlety worth flagging explicitly: `plannedMealToMealDocument` reads
planned-meal items with `nutrition_basis: 'per_component'` — i.e. it assumes
an item's stored `calories`/`macros` already describe that item's *total*
contribution, not a per-serving base to be multiplied by quantity again. If I
had written a grounded component's raw per-serving base value straight into
the item, a component at quantity 2 would silently double on the very next
read/write round-trip. `componentToPlannedMealItem` takes the already-scaled
`contribution` (from `recomputeMealNutrition`) as an explicit second
argument specifically to avoid this — it never touches `component.calories`/
`component.macros` directly.

`match_status`, `needs_review`, and `source_kind` are **not** part of
`PlannedMealItemSchema` today (that schema predates this packet and is
AI-content-only, per §2). I extended the *read shape* only
(`PlannedMealItemReadShape` in `adapters.ts`) with three optional fields and
made `plannedMealItemToComponent` prefer them when present, falling back to
the exact same derivation it always used
(`food_object_id ? 'matched' : 'none'`, `needs_review: false`) when absent.
Every pre-Phase-3 row has none of these keys, so every pre-Phase-3 row reads
back **byte-for-byte identically** to before — this is confirmed by the
existing `plannedMealToMealDocument` test in `adapters.test.ts`, which still
passes unmodified. New composer-authored rows carry the real values, so
editing a `'partial'`/`'guessed'` match and saving it back no longer silently
upgrades it to `'matched'` or clears `needs_review`. This is additive JSON,
not a new schema — no migration, no `validators.ts` change.

`preparation_note` reuses the existing `estimate_note` field
(`plannedMealItemToComponent` already read `estimate_note` into
`preparation_note`, pre-Phase-3 — I kept that exact mapping symmetric on
write instead of inventing a fourth field).

---

## 4. Legacy template/import entry — unmodified, still works

`components/journal/plans/SlotEditor.tsx` has exactly one change: the
already-existing internal `defaultMealTypeForSlot` helper is now `export`ed
(so `PlanMealComposerPanel` can default its own meal-type select the same
way, without reimplementing the rule) — the function's body, and every other
line of the file, is untouched. Specifically unaffected:

- `handlePickTemplate` / the saved-meal-template picker (with the Packet 5
  zero-nutrition guard, `payloadHasUsableNutrition`).
- `handlePickImport` / `handleConfirmScaledImport` / the imported-draft picker
  and servings-scaling step.
- `handleSubmitManual` / the manual name+type+totals form.

All three remain the **default** UI for both create and edit — the composer
is reached only via an explicit "Build with ingredients →" / "Edit
ingredients →" toggle that the day page renders alongside (not instead of)
`SlotEditor`. `git diff` on `SlotEditor.tsx` is 6 lines (a doc comment +
`export`), confirmed via `git diff --stat`.

---

## 5. Only pending meals are editable — three independent layers, none added by this phase

1. **UI reachability (existing, unchanged):** `SlotCard.tsx`'s `isHandled`
   check (`execution_state !== 'pending'`) already wraps the entire action
   bar including "Edit plan" — an eaten/skipped meal never renders an Edit
   button at all, composer or otherwise. Verified by reading `SlotCard.tsx`;
   zero lines of it changed in this phase.
2. **New defense-in-depth guard:** `PlanMealComposerPanel` independently
   checks `meal.execution_state !== 'pending'` and disables its "Save
   changes" action if so, in case a stale prop ever reached it. This can't
   currently be exercised through the UI (layer 1 already prevents it), but
   it means a future caller reusing this panel can't accidentally wire it to
   a handled meal and get a runtime failure instead of a disabled button.
3. **Server (existing, unchanged):** `assertPendingForRecovery` in
   `pages/api/journal/plans/meals/[mealId].ts` rejects PATCH/DELETE on a
   non-pending meal with a 409, regardless of what the client sends. This is
   the actual trust boundary; it wasn't touched.

`executePlannedMeal`, `deriveAdjustedConsumption`, `PlannedMealAdjustComposer.tsx`,
`plannedMealAdjustDerivation.ts`, idempotency (the `execution_state='pending'
AND journal_entry_id IS NULL` CAS), and undo are all outside this phase's diff
— confirmed by `git diff --stat` (§1).

---

## 6. Grounding, nutrition, and no-journal-entry guarantee

- **Progressive grounding, not blocking:** `validateComposerStateForSubmit`
  (Phase 2, unmodified) never gates on `needs_review` — it only requires a
  non-blank title, ≥1 component, non-blank component names, and positive
  quantities. `PlanMealComposerPanel`'s action handlers don't add a
  `needs_review`-based `disabled` either (unlike
  `PlannedMealAdjustComposer`, which *does* block on `needsReview` for a
  different reason — logging actual intake). An ungrounded ingredient can be
  added to a plan; `mealDocumentToPlannedMealPayload` simply omits its
  calories/macros rather than inventing them (tested — see §8).
- **Field-level fidelity guardrail:** `MealComposer.tsx`'s field visibility
  was split into `showDocumentOnlyFields` (description / serving label /
  yield / the review-confirmed checkbox — `MealDocument`-only concepts with
  no home in `PlannedMealPayload`) and `showPrepNotes` (maps to `notes_md`,
  shown for `plan`/`plan-edit` too). Before this change, `plan` mode (unused
  by any page until this phase) would have shown fields that silently
  vanished on submit — exactly the "active control that fails/misleads"
  failure mode the packet calls out. This only affects `plan`/`plan-edit`;
  `create`/`edit-saved` render identically to Phase 2.
- **No journal entry, ever:** confirmed by reading `PlanMealComposerPanel.tsx`
  top to bottom — its only network calls are `planService.createMeal` and
  `planService.updateMeal`. Grep across the new files for
  `createEntry`/`logInMemoryMealDocumentForPerson`/`/documents/log-instance`/
  `journal_entries` returns nothing.
- **"Save as Meal" not implemented:** `plan` mode's `save_as_meal`/
  `save_and_add` actions remain contract-complete (Phase 2's
  `MEAL_COMPOSER_CONTEXT_ACTIONS`) but `PlanMealComposerPanel` supplies a
  handler for `add_to_plan`/`update_plan` only. `MealComposer` hides any
  action with no handler (`if (!handler) return null` — Phase 2, unchanged),
  so this cannot render a broken button; it's a deliberate scope decision
  (the packet says Save as Meal "may remain a separate action," not that
  this phase must ship it) to keep this diff reviewable.

---

## 7. Browser QA — what I could and could not verify

**I do not have a browser automation tool in this environment**, and this
app's local dev server (`npm run dev`) gates every Plans page behind real
Supabase auth — `curl`/`WebFetch` can't carry a session, and `WebFetch`
explicitly can't reach `localhost` at all. So I could not click through the
day page myself. Here's exactly what I did instead, and what's left for a
live pass:

**What I verified:**
- `npx next build` (full production build) succeeds and includes
  `journal/plans/day/[date]` in its route manifest — the modified page and
  the new `PlanMealComposerPanel` compile and bundle cleanly end-to-end
  (catches syntax errors, bad imports, and JSX errors that `tsc` alone
  wouldn't).
- `tsc --noEmit` is clean on all non-test source (the project's pre-existing
  Jest-types issue in `*.test.ts` files is unrelated and was already present
  before Phase 2).
- A full code-trace (§1–§6 above) of every write path against the exact
  server-side guard that would reject a bad request, for every scenario
  below.

**What still needs a real click-through (I'd ask you or whoever has a live
session to do this before merge):**

1. Open a plan day → "Add meal to this slot" → "Build with ingredients →" →
   add 2–3 ingredients, ground one via food search, leave one unground →
   "Add to plan" → confirm the slot shows the new meal with correct totals
   and the ungrounded ingredient didn't block the add.
2. "Edit plan" on that same pending meal → "Edit ingredients →" → move an
   ingredient down, duplicate one, remove one → "Save changes" → confirm the
   slot reflects the new order/set and totals.
3. Confirm "← Use quick editor"/"← Use quick add" correctly falls back to
   the original `SlotEditor` (picker + manual form) with no console errors.
4. Confirm Move, Copy, "Log as planned", "Skip", and "Adjust & log" on
   *other* meals in the same day still behave exactly as before (this phase
   didn't touch their code, but a live pass is still the real confirmation).
5. Confirm an **eaten** or **skipped** meal never shows an Edit affordance,
   composer or otherwise (should be unreachable per §5, layer 1).
6. Check the Journal/log page after step 1–2 to confirm **no journal entry
   was created** by either composer action.

---

## 8. Automated tests

**14 new tests** in the initial implementation, all passing, alongside the
full existing suite (this section previously and incorrectly said 38 — see
§12.3):

| File | Covers |
|---|---|
| `lib/meals/__tests__/adapters.test.ts` (+8 tests) | `componentToPlannedMealItem`: writes the scaled contribution not the stored base; writes no calories/macros for a null (needs-review) contribution; `preparation_note` ⇄ `estimate_note`; omits `needs_review` when false. `mealDocumentToPlannedMealPayload`: sums via the same deterministic recompute; allows an ungrounded component through without blocking or inventing nutrition (**grounding/progressive-creation guardrail**); maps `prep_notes` → `notes_md` only when non-blank; **full round trip** through `plannedMealToMealDocument` preserving `match_status`, `food_object_id`, `needs_review`, and notes for both a matched and a guessed component (**nutrition + grounding preservation**). |
| `lib/meals/composer/__tests__/types.test.ts` (new, 6 tests) | `plan-edit` mode exposes exactly one action (`update_plan`); doesn't log consumption; `plan` mode's existing 3-action config is unchanged by the Phase 3 additions (**action availability / no regression to the approved Phase 2 config**); every mode has a non-empty, id-unique action list; `createInitialComposerState` is mode-agnostic for the new mode. |

**+21 more tests** were added in the corrective packet (macro-shape
compatibility) — see §12.5 for the full breakdown, bringing the Phase 3 total
to **35 new tests**.

Pre-existing Phase 2 suites (`componentOps`, `state`, `validate`,
`submission`) are **unmodified** and still pass — the `MealComposer.tsx`
field-visibility split only changes rendering for `plan`/`plan-edit` (unused
by any page before this phase), not `create`/`edit-saved`/`log`/
`adjust-and-log`.

Validation coverage (create/edit submit-readiness) is exercised via the
already-existing, mode-agnostic `validateComposerStateForSubmit` — Phase 2's
`validate.test.ts` already covers its rules generically; nothing mode-specific
needed adding since `plan`/`plan-edit` don't introduce new validation rules.

I did not add React-rendering tests for `PlanMealComposerPanel` itself: this
project's Jest config is `testEnvironment: 'node'` (no jsdom) project-wide,
and the one existing component test file
(`NutritionDensityGauge.test.tsx`) explicitly avoids DOM rendering for the
same reason, testing prop/interface shape only. `PlannedMealAdjustComposer`
(Phase 2's migrated surface) has no dedicated component test either — the
established convention in this codebase is to put automated coverage on the
pure logic (adapters, derivation, reducer) and leave the thin React wrapper
to manual/browser QA. I followed that convention rather than changing the
Jest environment as a side effect of this phase.

---

## 9. Full-suite result vs. Phase 2 baseline

| | Phase 2 baseline | Phase 3 (initial, `6266c72`) | Phase 3 + corrective packet |
|---|---|---|---|
| Test suites | 4 failed, N/A passed reported (not independently re-verified here) | 2 failed, 189 passed / 191 total | 2 failed, 191 passed / **193 total** |
| Tests | 2206 passed, 4 failed / 2210 total | 2220 passed, 4 failed / 2224 total (**+14 new**) | **2241 passed, 4 failed / 2245 total (+21 more new, +35 total)** |
| Failures | `lib/programs` marketing composition (2) + `/programs/[series]` page (2) | **identical** 4 failures, same files, same assertions | **identical** 4 failures, same files, same assertions |
| `tsc --noEmit` (non-test source) | 0 errors | 0 errors | 0 errors |
| `next build` | (not run in Phase 2) | succeeds | succeeds |

The 4 failures are unrelated to Plans/meals — confirmed by `git diff --stat`
touching zero files under `lib/programs` or `pages/programs`.

(Note: the original version of this table's "38 new tests" claim for Phase 3
did not match the passed-test delta; the corrected reconciliation — 14 new
tests in the initial implementation, +21 in the corrective packet, 35 total —
is in §12.3–§12.5.)

---

## 10. Files changed (initial implementation, commit `6266c72`)

```
 components/journal/plans/SlotEditor.tsx    |   6 +-   (export one existing helper; no logic change)
 components/meals/composer/MealComposer.tsx |  47 ++-  (field-visibility split for plan/plan-edit)
 lib/meals/__tests__/adapters.test.ts       | +217     (new tests)
 lib/meals/adapters.ts                      | +110 -1  (inverse conversion + read-shape extension)
 lib/meals/composer/types.ts                |  33 +-   (plan-edit mode + update_plan action)
 pages/journal/plans/day/[date].tsx         |  84 +-   (toggle + panel wiring, both editor blocks)
 components/journal/plans/PlanMealComposerPanel.tsx  (new)
 lib/meals/composer/__tests__/types.test.ts           (new)
```

See §12.2 for the corrective packet's additional files.

---

## 12. Corrective packet (post conditional-approval review)

Applied in response to conditional approval of Phase 3: hold before merge,
correct the macro-casing compatibility bug flagged during the Phase 3 audit,
correct this report's test-count discrepancy, and attempt an authenticated
browser-QA pass. Commit: `581023f`. Draft PR:
[#148](https://github.com/Fine-Diet/fine-diet-platform/pull/148) (not merged).

### 12.1 Macro compatibility — before and after

**Before:** `SlotEditor.templateToPayload` wrote each planned-meal item's
macros as legacy snake `_g` keys (`{protein_g, carbs_g, fat_g}`) when a
saved-meal template was attached to a slot. Every reader —
`plannedMealItemToComponent` (feeds both the Edit Ingredients composer and
Adjust & Log) and `ndsConfidence.ts`'s `itemHasMacros` — only recognized the
canonical camelCase shape (`{protein, carbs, fat}`, the shape
`componentToPlannedMealItem` writes and `PlannedMealItemSchema` documents).
The mismatch meant a template-originated planned meal's item macros silently
read back as `null`/zero in the composer, Adjust & Log, and NDS confidence
scoring — a real bug, not a hypothetical one, for every planned meal created
from a saved template.

**After:** a single shared normalizer, `macrosFromCompat` (new, exported
from `lib/meals/adapters.ts`), accepts an object carrying either or both
shapes and resolves each field camelCase-first, falling back to the snake
`_g` key per field:

```typescript
export function macrosFromCompat(
  macros: CompatMacrosInput | null | undefined
): { protein: number | null; carbs: number | null; fat: number | null } {
  return {
    protein: numOrNull(macros?.protein ?? macros?.protein_g),
    carbs: numOrNull(macros?.carbs ?? macros?.carbs_g),
    fat: numOrNull(macros?.fat ?? macros?.fat_g),
  };
}
```

- `SlotEditor.templateToPayload` now writes canonical camelCase for all
  **new** template-originated items. Totals (a separate, always-snake-`_g`
  shape per `PlannedMealPayload.totals`) are untouched.
- `plannedMealItemToComponent` (`lib/meals/adapters.ts`) now reads item
  macros through `macrosFromCompat` — it accepts both shapes identically, so
  the Edit Ingredients composer and Adjust & Log (both consume its output via
  `plannedMealToMealDocument`) receive correct macros regardless of which
  shape a row was written in.
- `ndsConfidence.ts`'s `itemHasMacros` now calls the **same**
  `macrosFromCompat` (imported from `lib/meals/adapters.ts`) instead of its
  own camelCase-only check — one shared interpretation, not two.
- `SlotEditor.payloadHasUsableNutrition` (the Packet 5 zero-nutrition attach
  guard) was also switched to `macrosFromCompat` so it doesn't regress to
  rejecting a legitimate camelCase-only template attach.
- **No historical rows were rewritten or migrated.** Existing snake-case rows
  keep their stored JSON exactly as-is; only the read interpretation changed.

### 12.2 Files changed (corrective packet)

```
 components/journal/plans/SlotEditor.tsx                    |  ~30 +-  (templateToPayload writes camelCase; payloadHasUsableNutrition uses macrosFromCompat; templateToPayload exported for testing)
 lib/meals/adapters.ts                                       |  +32     (CompatMacrosInput + macrosFromCompat; plannedMealItemToComponent uses it)
 lib/plans/ndsConfidence.ts                                   |  ~15 +-  (LooseMealItem.macros widened; itemHasMacros uses macrosFromCompat)
 lib/meals/__tests__/adapters.test.ts                         |  +130    (macro-compatibility test suite)
 lib/plans/__tests__/ndsConfidence.test.ts                    |  (new)
 components/journal/plans/__tests__/SlotEditor.test.ts        |  (new)
 docs/design/PLANS-AUTHORING-CONVERGENCE-PHASE3-PLANS-INTEGRATION.md | (this report, corrected)
```

### 12.3 Test-count reconciliation

The original §0/§8 claim of "38 new tests" for the initial Phase 3
implementation did not match the passed-test delta (2206 → 2220 = **+14**),
nor the sum of the two files actually listed in §8's table (8 + 6 = **14**).
**14 is the correct count** for the initial implementation
(`lib/meals/__tests__/adapters.test.ts` +8, `lib/meals/composer/__tests__/types.test.ts` +6, new file). There was no dropped third file — the "38" was
simply wrong.

### 12.4 New focused tests (corrective packet)

**+21 tests, all passing:**

| File | New tests | Proves |
|---|---|---|
| `lib/meals/__tests__/adapters.test.ts` | +8 | `macrosFromCompat` prefers camelCase per-field, falls back to snake `_g` per-field, mixes shapes, and returns all-null for a missing object (4). `plannedMealToMealDocument` (the function both the Edit Ingredients composer and Adjust & Log call) reads a legacy snake-case item's macros correctly and a canonical camelCase item's macros correctly, to the identical `CanonicalMacros` result (2). A camelCase-write → read → write **round trip does not double-scale** nutrition (1). A cross-check that `macrosFromCompat` normalizes both shapes to the same value, the same normalization NDS coverage relies on (1). |
| `lib/plans/__tests__/ndsConfidence.test.ts` (new) | +9 | `coverageForMealItems` classifies a legacy snake-case macro item and a canonical camelCase macro item **identically** as "estimate" coverage; a resolved (has `food_object_id`) item is "resolved" regardless of macro shape; an item with no macros in either shape is "ai_or_text"; `confidenceForMealItems` maps a mixed-shape meal to the same confidence bucket regardless of shape (5) — plus 4 regression-guard tests for the unchanged Phase 2 `confidenceForCoverage`/`confidenceForDay`/`projectionConfidenceForPlannedMeals` rules. |
| `components/journal/plans/__tests__/SlotEditor.test.ts` (new) | +4 | `templateToPayload` writes the canonical camelCase item macro shape (not `protein_g`/`carbs_g`/`fat_g`); writes `null` (not an omitted key) when a template item has no macros; totals remain the existing snake `_g` shape (unaffected by this correction); `source_template_id` provenance is stamped. |

`templateToPayload` was exported from `SlotEditor.tsx` (previously
module-private) so the write-shape test above can call it directly without
exercising the picker UI — no behavior changed by this export.

### 12.5 Full-suite / TypeScript / build result after the corrective fix

- **Focused tests:** all 21 new tests pass (`npx jest lib/meals/__tests__/adapters.test.ts lib/plans/__tests__/ndsConfidence.test.ts components/journal/plans/__tests__/SlotEditor.test.ts` → 45 passed, 3 suites).
- **Full suite:** 2241 passed, 4 failed, 2245 total, across 193 suites (191 passed, 2 failed) — the same 4 pre-existing `lib/programs`/`/programs/[series]` failures as the Phase 2 baseline and the initial Phase 3 implementation; zero new failures.
- **`tsc --noEmit`:** 0 errors outside `*.test.ts`/`__tests__` files (the project's pre-existing Jest-types config gap, confirmed unrelated to `adapters.ts`, `ndsConfidence.ts`, or `SlotEditor.tsx` — grepped the full output for those three filenames and for any non-test file path; none found).
- **`next build`:** succeeds, includes `journal/plans/day/[date]` in the route manifest.

### 12.6 Authenticated browser QA — blocker (unchanged from §7)

**Not performed.** This environment has no interactive browser tool and no
way to establish an authenticated Supabase session against the Next.js dev
server (`curl`/`WebFetch` can't carry a session; `WebFetch` can't reach
`localhost` at all). This packet is left in **`needs_review`**, not
"browser-QA passed."

For a human reviewer:
- **Branch/PR:** `feat/plans-authoring-convergence-packet-audit`, draft PR
  [#148](https://github.com/Fine-Diet/fine-diet-platform/pull/148).
- **Setup:** run the branch locally (`npm run dev`) and sign in with your own
  Supabase-authenticated account — there is no separate shared test account
  in this environment. If you'd rather review on a hosted preview, let me
  know and I can request a Vercel preview deployment for PR #148 (this repo
  has Vercel integration available via MCP, but I did not deploy one
  unprompted since it wasn't part of the corrective packet's explicit ask).
- **Click-path:** the exact 6-step sequence in §7's "What still needs a real
  click-through" list, **plus** these two additions specific to this
  corrective packet:
  7. Attach a **saved-meal template** to a slot (the picker `SlotEditor`
     already offers, not the composer) → open that planned meal's "Edit
     ingredients →" (composer) and confirm its component macros display
     correctly (this is the exact case that was broken before §12.1).
  8. Open the same template-originated meal's "Adjust & log" flow and confirm
     it also shows the correct macros (same underlying read path as step 7).

### 12.7 Confirmation: no Journal or planned-meal execution paths changed

- `git diff 6266c72..HEAD -- lib/plans/plannedMealExecutionPayload.ts lib/plans/plannedMealAdjustDerivation.ts lib/plans/plannedMealAdjustedPayloadValidation.ts components/journal/log/PlannedMealAdjustComposer.tsx pages/api/journal/plans/meals` is empty — none of these files changed in the corrective commit.
- The only planned-meal-adjacent file touched is `SlotEditor.tsx`, and only
  its two macro-shape functions (`templateToPayload`'s item-macro literal,
  `payloadHasUsableNutrition`'s macro check) — `handleSaveCreate`,
  `handleSaveEdit`, and every other function are unchanged.
- No `journal_entries`/`createEntry`/`logInMemoryMealDocumentForPerson` call
  was added anywhere in the corrective diff (grep across the changed files
  returns nothing).
- Idempotency (`execution_state='pending' AND journal_entry_id IS NULL`),
  Undo, and `assertPendingForRecovery` are all in files this corrective
  packet did not touch.

---

## 13. What's next

Per your instruction, stopping here for review. Pending your sign-off, the
next phase is the Day Template editor — which, per §5.4 of the Gate 1 audit,
still has no get-by-id/update/delete route or service function at all (only
snapshot-and-instantiate), so that phase starts from a real gap rather than
an integration.
