# Package 5B — Typed Plan-to-Grocery Demand Expansion Execution Report

## Branch / base

- **Branch:** `feat/typed-plan-grocery-expansion-v1`
- **Exact base:** `0a6d3415d87a70ad30bd302e1e9c48642e20dde1`
- **Bridge proceed:** `e718b4b6-730d-40e1-8913-e97329dfd892`
- **Audit status:** `7c450f30-0045-4ea6-a786-b6067c111cc0`
- **Implementation auth:** `e0df7f07-80e9-4220-9cd6-a07c48d101c1`
- **Evidence SHA (functional):** `b88ef280fe4991fa56509d7651d6e6d8b1069b7c`
- **READY Vercel preview:** `https://fine-diet-platform-1qcx3kim4-fine-diet.vercel.app`

## Audit summary (pre-edit)

| Area | Finding |
|---|---|
| Grocery derivation | Read only `payload.items[]`; never called `expandMealComposition` |
| Recipe portions | Became unresolved title lines, not ingredient demand |
| Expansion contract | Present from 5A; unwired; no portion/yield scaling |
| Provenance | Meal ids only; `GroceryDemandProvenanceContract` tree-only |
| Pantry / units | Exact normalized unit equality; left unchanged |
| Schema | No DDL required; `source_detail_json` already optional |

## Compatibility strategy implemented

1. Keep generate/reconcile entrypoints (`deriveItemsFromMeals`, `deriveGroceryDemandForScope`, `generateGroceryList`)
2. Hydrate via `plannedMealToMealDocument` (`typed_components` preferred, `items[]` fallback)
3. Person-scoped `resolveRecipe` via `getMealDocumentForPerson` (archived readable)
4. `expandMealComposition` → flatten demand leaves only (`recipe_portion` structural)
5. Scale ingredients by portion ÷ confirmed recipe yield; soft-fail null qty + note
6. Preserve contributors in `notes` + `source_detail_json.expansion_contributors` (no migration)
7. Aggregate only on identity + exact normalized unit
8. Nested recipes: explicit cycle-safe one-level boundary

## What shipped

- `lib/meals/componentExpansion.ts` — portion/yield scaling + nested boundary notes
- `lib/plans/groceryDemandExpansion.ts` — hydrate/expand/flatten + recipe batch loader
- `lib/plans/groceryServerService.ts` — wired typed expansion into derivation + persist detail
- `lib/plans/groceryListService.ts` — reconcile merges expansion detail into `source_detail_json`
- Focused Jest coverage for required regression cases

## Migrations

- **Authored:** none
- **Applied:** none
- **Production data mutation:** none

## Holds respected

- No full Pantry / pantry-lot schema
- No grocery redesign, collaboration, product optimization
- No prepared-batch / preparation-transformation UI
- No AI / voice
- No production DDL/SQL, PR, merge, force-push, or production deployment

## Correction — stale day-template MealDocument pointer

- **Bridge review note:** `fae30dda-e966-4f70-badb-1e1340a98d3a`
- **Founder blocker:** Applying `Standard Day V1` failed with `MealDocument not found for this person.`
- **Root cause:** Template meal `Chicken Sausage + English Muffin + Smoothie Breakfast` retained stale `source_meal_document_id` `4519ebf7-533a-43f6-a44d-975ad6e7e83e` (no `meal_documents` row) while still carrying an embedded payload snapshot. Strict Package 4 attach correctly rejected it during instantiation.
- **How the pointer entered:** Day-template save copies planned-meal payloads via `plannedMealToTemplateMeal` / library picker `buildTemplateMealFromDocument`, including `source_meal_document_id`. Later hard-missing documents leave the reusable snapshot with a dangling pointer.
- **Policy implemented:** For reusable day-template / week-pattern instantiation only (`attachMode: 'reusable_snapshot'`), if the pointer is missing/cross-person **and** an embedded snapshot exists (`meal_document_snapshot`, `items[]`, or `typed_components`), clear only the invalid pointer, preserve embedded composition (including recipe refs inside `typed_components`), and stamp audit fields. Valid same-person pointers still stamp normally. Archived new-attach rejection unchanged. Strict composer/manual attach unchanged.
- **Correction SHA:** `ec4477eb5f7be9ae72955c5589e052886a3c40fb`
- **Correction READY preview:** `https://fine-diet-platform-76mraa18v-fine-diet.vercel.app`
- **No production template mutation / SQL repair** performed.

## Correction — slot fidelity + snapshot completeness

- **Bridge auth:** `126e0b72-4814-466e-b849-acf826b3b694`
- **Audit:** `c6907dee-acbc-46b1-b466-7e7540713433`
- **Cause:** `matchReusableSlotToTarget` required exact `target_time` strings (`10:00` ≠ `10:00:00`) then fell back to ordinal across 1-based blank templates vs 0-based generated days, shifting Breakfast→Lunch and leaving Dinner unassigned.
- **Fix:** Semantic matcher (normalized time/label/block) before ordinal; refuse ordinal when roles contradict; claim target slots during apply; return `placement_conflicts` and stamp `placement_review_note` on unresolved meals. Snapshot completeness guard: stale-pointer clear requires non-empty `items` or `typed_components` (marker-only rejected).
- **Holds:** no replace-day UI, week-builder, MealDocument refresh UI, PR/merge/prod deploy, SQL/DDL.
- **Slot-fidelity SHA:** _(filled after push)_
- **Slot-fidelity READY preview:** _(filled after deploy)_

## Stop state

`needs_review`
