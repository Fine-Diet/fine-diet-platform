# Plans Authoring Convergence — Phase 2 Bridge Report: Shared Meal Composer

**Status:** Implementation complete, tested, isolated on
`feat/plans-authoring-convergence-packet-audit`. Not merged. Not yet wired
into Plans (Phase 3 scope). Gate 2 of the Fine Diet Plans Authoring
Convergence execution packet (doc `e742593a-3d7c-423b-9221-2d697df56f5a`),
building on Gate 1 (`docs/design/PLANS-AUTHORING-CONVERGENCE-AUDIT.md`).

---

## 0. TL;DR

Extracted one shared, mode-aware Meal Composer engine + presentational
component that operates exclusively on `MealComponent[]` / canonical
`MealDocument`. It has five context modes (`create`, `edit-saved`, `plan`,
`log`, `adjust-and-log`), all sharing the same reducer, component-list
editing controls (move up/down, duplicate, remove, swap — no drag-and-drop),
deterministic recompute, and food-search grounding.

One production surface — `PlannedMealAdjustComposer` (`adjust-and-log`) — was
migrated end-to-end to prove the extraction works against real submission
logic. The other four modes are contract-complete and covered by unit and
route-level tests, but are **not yet wired into any page**; that wiring is
Phase 3 (Plans) and a follow-up Log/create-meal UI pass, both out of scope
here per your instruction not to touch Plans yet.

No existing storage, route, or behavior was changed. Two new API routes were
added (both net-new capability the Phase 1 audit flagged as missing, not
replacements). All four packet guardrails (MealDocument-only save target,
grouped-logging wrapper, server-side Meal Rhythm resolution, append-only
apply policy) are honored, with Meal Rhythm resolution specifically not yet
exercised because `plan` mode has no page in this phase (see §5).

Full test run: **2206 passed / 4 failed**, all 4 failures pre-existing and
unrelated (`lib/programs` marketing composition + `/programs/[series]` page
tests — no file in this phase touches `lib/programs`).

---

## 1. The shared composer: component and state contract

### 1.1 Engine (`lib/meals/composer/`) — pure, no React, no I/O

| File | Responsibility |
|---|---|
| `types.ts` | `MealComposerMode`, `MealComposerState`, `MealComposerAction` union, `MealComposerActionId`, and the static per-mode action config (`MEAL_COMPOSER_CONTEXT_ACTIONS`). |
| `componentOps.ts` | Pure `MealComponent[]` operations: `addBlankComponent`, `addComponentFromSelection`, `removeComponent`, `moveComponentUp`/`moveComponentDown`, `swapComponents`, `duplicateComponent`, `updateComponentName`/`QuantityUnit`/`PrepNote`, `applySelectionToComponent`, `clearComponentGrounding`, `setComponentNeedsReview`. Deliberately reimplemented here rather than imported from `lib/plans`, to keep `lib/meals` (foundational layer) with zero dependency on `lib/plans`. |
| `state.ts` | `composerReducer` + `createComposerState`/`createBlankMealDocument`. Every component-affecting action re-runs `lib/meals/recompute.ts` (deterministic, unchanged) so `state.document.total_nutrition` and `needs_review` are never stale. |
| `validate.ts` | `validateComposerStateForSubmit` — client-side submit-readiness gate (title required, ≥1 component, positive quantities/servings). Mode-aware: servings validation only applies to `log`/`adjust-and-log`. |
| `submission.ts` | Pure translators from composer state to each **existing** write shape (§3). |

### 1.2 State contract

```typescript
interface MealComposerState {
  mode: MealComposerMode;              // 'create' | 'edit-saved' | 'plan' | 'log' | 'adjust-and-log'
  document: MealDocument;              // the live draft; canonical shape, unmodified
  consumedServingsInput: string;       // raw controlled text, log / adjust-and-log only
  instanceNote: string;                // per-instance note, log / adjust-and-log only
  needsReview: boolean;                // mirrors last recompute's review flag
}
```

This is the entire cross-surface contract. Any caller can seed `document`
from any existing adapter (`plannedMealToMealDocument`,
`mealTemplateItemToComponent` + `createBlankMealDocument`, an already-loaded
`MealDocument`, etc.) and get identical editing behavior.

### 1.3 Presentational component (`components/meals/composer/`)

| File | Responsibility |
|---|---|
| `MealComposerComponentList.tsx` | Renders `MealComponent[]` rows with explicit move-up/move-down/duplicate/remove controls and an embedded `MealComponentFoodSearch` per row for grounding — the existing reusable food-search/grounding UI, untouched. |
| `MealComposer.tsx` | The full form shell: title/description/prep notes/serving label/yield (full-field modes only), servings-eaten + note (consumption-logging modes only), the component list, recipe steps (recipe kind only), the review-confirmed checkbox, nutrition preview, and a context-driven action button row. |
| `useMealComposer.ts` | Thin `useReducer(composerReducer, createComposerState(...))` convenience wrapper for callers that don't need to interleave the draft with their own derived state. |

`MealComposer` is a **controlled** component — `state`/`dispatch` are owned
by the caller, not internally — specifically so a caller like
`PlannedMealAdjustComposer` can read `state.document` on every render to
recompute its own derived preview (`deriveAdjustedConsumption`) without an
imperative escape hatch.

---

## 2. How context-specific actions are injected

`MealComposer` never fetches, never knows about a specific API route, and
never knows what "Save" means for a given surface. Two things carry that
information, both supplied by the caller:

1. **`MEAL_COMPOSER_CONTEXT_ACTIONS`** (`lib/meals/composer/types.ts`) — a
   static, mode-keyed table of which action ids exist and their label/emphasis:

   | Mode | Actions |
   |---|---|
   | `create` | `save` (primary) |
   | `edit-saved` | `save_changes` (primary) |
   | `plan` | `add_to_plan` (primary), `save_as_meal`, `save_and_add` (secondary) |
   | `log` | `log_meal` (primary), `save_as_meal`, `log_and_save` (secondary) |
   | `adjust-and-log` | `log_adjusted` (primary) |

2. **`MealComposerActionHandlers`** (`components/meals/composer/MealComposer.tsx`)
   — a `Partial<Record<MealComposerActionId, { label?, disabled?, onRun }>>`
   the caller passes as the `actions` prop. `MealComposer` renders a button
   for each configured action *that has a handler supplied*, tracks a single
   in-flight `pendingActionId` (disables all buttons while one action runs),
   and calls `onRun()` on click — nothing else. The caller's `onRun` is
   exactly where the real submission logic (`submission.ts` builders → an
   existing service/route) lives.

This is the whole mechanism: the shared engine and shared UI carry the
*shape* of each context's actions; the caller injects the *behavior*. Adding
a sixth mode later means adding one row to the table and one component that
supplies handlers — never touching the engine or the shared component.

---

## 3. Submission builders → existing write paths (no new formats)

`lib/meals/composer/submission.ts` translates `MealComposerState` into
exactly the payload each **pre-existing** write path already accepts:

| Mode | Builder | Target (unchanged) |
|---|---|---|
| `create` | `buildDocumentForCreate` | `POST /api/journal/meals/documents` → `createMealDocumentForPerson` (new route, §4; existing service) |
| `edit-saved` | `buildStructuralEditPatch` | `PATCH /api/journal/meals/documents/[id]` → `applyMealDocumentEditForPerson` (existing route + service, untouched) |
| `log` | `buildComposerLogPayload` | `buildGroupedMealIntakePayload` (existing, unchanged) → `POST /api/journal/meals/documents/log-instance` (new route, §4) or `logMealDocumentForPerson` if already persisted |
| `adjust-and-log` | *(not in submission.ts — deliberately)* | `lib/plans/plannedMealAdjustDerivation.ts` (existing, unchanged) → `planService.executeMeal(id, 'log_adjusted', ...)` (existing, unchanged) |
| `plan` | *(deferred — no builder yet)* | Phase 3: attach to a planned occasion / `SlotEditor` |

`buildStructuralEditPatch` diffs the composer's edited `MealComponent[]`
against the originally-loaded document by `component_id` set membership
(add / remove / unmatch-grounding / field-change) and emits the identical
`{ components, add_components, remove_component_ids, unmatch_component_ids,
steps, review_state, ... }` shape `EditMealDocumentPanel.buildPatch` already
produces for the same PATCH route — generalized off `MealComponent[]`
instead of a bespoke UI draft type, so any composer-mode caller gets the
same minimal-diff PATCH behavior for free.

`buildComposerLogPayload` calls the existing `buildGroupedMealIntakePayload`
directly — it does not reimplement grouped-payload construction, and
`logMealDocumentForPerson`'s signature was not touched.

---

## 4. Compatibility wrapper + new routes

### 4.1 `lib/meals/composerMealLoggingService.ts` — the requested thin wrapper

```typescript
export async function logInMemoryMealDocumentForPerson(
  personId: string,
  document: MealDocument,
  input?: GroupedMealLogInput,
): Promise<JournalEntry>
```

Reuses `buildGroupedMealIntakePayload` (existing) to build the grouped
payload from an **unsaved, in-memory** `MealDocument`, then calls
`createEntry` (existing `journalServerService`) directly — no
`meal_documents` round trip, no new grouped-entry format, and
`logMealDocumentForPerson`'s existing signature is untouched (this is a
sibling function, not a modification). This is exactly what makes "Log Meal"
possible for a draft the user never chose to save.

### 4.2 Two new API routes (net-new capability, not replacements)

Phase 1 identified both as **missing** write paths, not existing ones being
duplicated:

- **`POST /api/journal/meals/documents`** — creates a `MealDocument` from
  scratch via the existing `createMealDocumentForPerson` service. Before
  this route, `MealDocument` creation only happened via the import-confirm
  path; there was no hand-authored "create a meal" write path at all.
- **`POST /api/journal/meals/documents/log-instance`** — logs a
  composer draft via `logInMemoryMealDocumentForPerson` (§4.1).

Both enforce the same auth pattern as every other journal route
(`requireJournalAuth` + `requireCallerJournalAccess`), both derive `personId`
from the authenticated session (never trust the client's `person_id`), and
both are exercised by route-level tests (§6).

---

## 5. Meal Rhythm resolution — acknowledged, not yet exercised

Per your instruction, "Use my current Meal Rhythm" must resolve server-side
via the same resolver plan generation uses: `resolveMealSchedule`
(`lib/plans/scheduleResolver.ts`), identified in the Phase 1 audit (§5.5).

**Nothing in this phase reproduces schedule-default logic client-side** —
the composer engine has no knowledge of `MealRhythm`/`meal_schedule` at all.
However, `plan` mode has no page wiring it up yet (that's the Day
Template/Plans work in Phase 3+), so there is no live code path to point to
yet that calls `resolveMealSchedule` from a composer action. This guardrail
is honored by *absence* right now — flagging it explicitly so Phase 3 doesn't
lose the requirement: the "Use my current Meal Rhythm" action handler must
call `resolveMealSchedule` server-side (e.g. from a small new route), never
duplicate slot-default logic in `plan`-mode UI code.

`apply_policy` remains untouched — no code in this phase reads, writes, or
brands anything as `append`/`replace`; that stays entirely Phase 3+ scope on
Day Templates/Week Patterns, which this phase does not touch.

---

## 6. Existing surfaces migrated to prove the extraction

**One:** `components/journal/log/PlannedMealAdjustComposer.tsx`
(`adjust-and-log` mode), used from `PlannedMealContextCard.tsx`. This is the
only production entry point rewired in this phase — its external props
(`plannedMeal`, `dateKey`, `time`, `redirectTarget`, `onLogged`) and its
single caller are unchanged, so no other file needed to change.

What changed inside it: all component-list editing (add blank, add from
search, remove, move up/down, duplicate, edit name/quantity/unit/prep note,
apply/clear grounding) now goes through `composerReducer` +
`MealComposer`/`MealComposerComponentList` instead of a bespoke local
reducer. What deliberately did **not** change: `deriveAdjustedConsumption`
(nutrition preview + payload derivation) and
`planService.executeMeal(id, 'log_adjusted', ...)` (submission) are called
exactly as before — this phase does not touch planned-meal execution or
idempotency behavior, and the test suite for that derivation
(`lib/plans/__tests__/plannedMealAdjustDerivation.test.ts`) was not modified
and still passes unchanged.

**Not migrated in this phase (by design):**

- `components/meals/EditMealDocumentPanel.tsx` (`edit-saved`'s natural home)
  — audited for its patch shape (which `buildStructuralEditPatch` now
  generalizes) but left untouched. Migrating it is low-risk follow-up, not
  done here to keep this phase's diff scoped to one proven end-to-end path
  plus a fully-tested, not-yet-wired engine for the rest.
- Any `create`/`log`/`plan` page — none exists yet for `create`/`plan`
  in the canonical `MealDocument` system, and Log's "compose then log" entry
  point doesn't exist yet either (today's `pages/journal/log.tsx` is a
  search/capture surface, per Phase 1 §0.1). Building those pages is Phase 3+
  UI work, not this phase's "extract and validate the shared component" goal.
- `handleApplySavedMeal`'s flat-row legacy behavior — explicitly acknowledged
  as technical debt per your instruction, untouched.

---

## 7. Tests

73 new tests across 7 suites, all passing, plus zero regressions in the
2137 pre-existing tests that were already passing (2206 passed total across
the whole repo; the 4 failures are pre-existing and unrelated — see §0).

| Suite | Covers |
|---|---|
| `lib/meals/composer/__tests__/componentOps.test.ts` (26 tests) | Add/remove/move-up/move-down/swap/duplicate/rename/re-quantify, including edge cases (no-op at list boundaries, no-op on unknown id, grounding-detach-on-rename, per_component vs per_serving nutrition detach rules on unit change). |
| `lib/meals/composer/__tests__/state.test.ts` (11 tests) | Reducer field setters, and — critically — that every component-affecting action (add/remove/move/duplicate/swap) re-runs recompute and keeps `document.total_nutrition`/`needsReview` in sync; step add/update/remove with renumbering. |
| `lib/meals/composer/__tests__/validate.test.ts` (8 tests) | Submit-readiness gating: blank title, empty component list, blank component name, non-positive quantity/servings/yield; mode-aware servings requirement (log/adjust-and-log vs create/edit-saved). |
| `lib/meals/composer/__tests__/submission.test.ts` (13 tests) | `buildDocumentForCreate` (confirmed-state promotion policy), `buildStructuralEditPatch` (title/description/component add/remove/unmatch/change/steps/review_state diffing against a loaded original), `buildComposerLogPayload` (delegates to the existing grouped builder, servings-input parsing/defaulting). |
| `lib/meals/__tests__/composerMealLoggingService.test.ts` (5 tests) | The compatibility wrapper: logs an unsaved (`id: null`) document with zero DB lookups, produces the same grouped `meal_group` shape as `logMealDocumentForPerson`, rejects invalid input before writing, does not fabricate nutrition for a needs-review draft. |
| `pages/api/journal/meals/documents/__tests__/index.test.ts` (5 tests) | New create route: scopes to caller `personId`, ignores a spoofed `person_id` in the body, 400 on validation error, 405 on wrong method (before auth), 403-equivalent when access is denied. |
| `pages/api/journal/meals/documents/__tests__/log-instance.test.ts` (5 tests) | New log-instance route: no DB lookup for an unsaved draft, stamps caller `personId` over a spoofed one, 400 on malformed document/invalid input, 405 before auth. |

Grounding-change coverage lives in `componentOps.test.ts`
(`addComponentFromSelection`/`applySelectionToComponent`/`clearComponentGrounding`/`setComponentNeedsReview`)
and is exercised through the reducer in `state.test.ts`; nutrition
recomputation coverage lives in `state.test.ts`'s "component ops trigger
recompute" block plus `submission.test.ts`'s needs-review-blocks-confirmed
case. Context-specific submission behavior is covered per-mode in
`submission.test.ts` (create/edit-saved/log) and per-route in the two API
test files; `adjust-and-log`'s submission behavior is unchanged existing
coverage in `plannedMealAdjustDerivation.test.ts` (not modified, still
passing) since this phase deliberately did not touch that logic.

---

## 8. Confirmation: no unintended boundary or behavior changes

- **Legacy storage:** `journal_meal_templates` was not read, written, or
  imported by any file added or changed in this phase.
- **Journal/planned-meal boundary:** `PlannedMealAdjustComposer` still edits
  an in-memory snapshot only; submission still goes through
  `planService.executeMeal(..., 'log_adjusted', ...)` unchanged.
  `plannedMealExecutionPayload.ts` and `executePlannedMealIdempotency.test.ts`
  were not touched and their tests still pass unchanged.
  `deriveAdjustedConsumption` and `formatConsumedNutritionPreview` were not
  modified.
- **`logMealDocumentForPerson`:** signature and body untouched; the new
  wrapper is a sibling function in a new file.
- **`buildGroupedMealIntakePayload`:** untouched, reused as-is by both the
  wrapper and `buildComposerLogPayload` — no competing grouped-entry format
  was introduced.
- **`apply_policy`:** not referenced anywhere in this phase's code.
- **Recompute policy:** `lib/meals/recompute.ts` was not modified; the
  reducer only calls it, per the existing "don't silently clear an inbound
  `needs_review`" policy documented there.
- **Full-suite regression check:** `npx jest` → 2206 passed, 4 failed
  (`lib/programs/__tests__/programsMarketingApi.test.ts`,
  `__tests__/pages/programs/seriesPage.test.ts`), pre-existing failures in
  an unrelated feature area — no file under `lib/programs`, `pages/programs`,
  or programs marketing was touched by this phase.
- **Type safety:** `tsc --noEmit` shows zero errors in any non-test source
  file touched or added by this phase. Every remaining `tsc` error is inside
  a pre-existing `.test.ts`/`.test.tsx` file (project-wide, unrelated to this
  packet — Jest globals aren't in the root `tsconfig`'s `types` array; this
  affects all ~150 test files in the repo, not just this phase's).

---

## 9. What Phase 3 inherits

- A stable `MealComposerState`/`MealComposerAction` contract and a
  presentational `MealComposer` component ready for `plan` mode: build a
  `SlotEditor`-facing wrapper that supplies `add_to_plan`/`save_as_meal`/
  `save_and_add` handlers — no engine changes needed.
- Two working, tested API routes (`POST .../documents`,
  `POST .../documents/log-instance`) ready for a `create` page and a
  "compose then log" Log entry point.
- `buildStructuralEditPatch`, tested and ready, for migrating
  `EditMealDocumentPanel` onto the shared composer whenever that's prioritized.
- An explicit flag (§5) that "Use my current Meal Rhythm" must call
  `resolveMealSchedule` server-side — not yet implemented, since it has no
  caller in this phase.
