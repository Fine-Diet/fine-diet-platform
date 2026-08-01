# Package 5A — Canonical Food Graph and Meal Composition Execution Report

## Branch / base

- **Branch:** `feat/food-graph-meal-composition-v1`
- **Exact base:** `9d25cabd7392df2d616c81727893eab8f345de20`
- **Evidence SHA (functional):** `783998414f51b94897107305bd6d66e7779e0ffb`
- **READY Vercel preview:** `https://fine-diet-platform-ln4kokzya-fine-diet.vercel.app`

## Audit summary (pre-edit)

| Area | Finding |
|---|---|
| MealComponent | Flat food/`user_entered` only; durable `component_id` already present |
| Recipe-as-component | Missing |
| `source_kind` | Nutrition provenance only (correct); no separate component kind |
| food concept vs product | Soft via `food_objects.sourceType`; single `food_object_id` |
| Planning adapter | Flattened to `payload.items[]`; dropped structure |
| Production shapes (read-only) | 44 meals / 57 recipes; 0 typed recipe refs; 0 missing `component_id` |
| Canonical QA meal | `Chicken Sausage + English Muffin + Smoothie Breakfast` existed with 1 flat component; `Morning Smoothie` recipe exists |

## Compatibility strategy chosen

**Extend existing `MealComponent` / `MealDocument` additively — no parallel model.**

1. Add `component_kind` + recipe reference/snapshot fields
2. Shared normalizer at hydrate / persist / composer / planning boundaries
3. Infer legacy kinds conservatively (`food_object_id` → `food_concept`; never invent recipe refs from names)
4. Planning writes `typed_components` while keeping legacy `items[]`
5. JSON-only additive fields; **no migrations authored or applied**

## What shipped

- Discriminated `component_kind`: `food_concept` | `product_variant` | `recipe_document` | `user_entered` | reserved `prepared_batch`
- Recipe components: live `recipe_meal_document_id`, `recipe_version_token`, display + nutrition snapshots
- `document_version` content token (bumped on update)
- Composer: add saved Recipe; edit panel uses MealComposer + `set_components`
- Planning: `typed_components` round-trip preserves recipe refs
- Expansion contract for Package 5B (`expandMealComposition`)
- Extension contracts: preparation transformation, prepared batch, grocery provenance IDs
- Zod `.passthrough()` for unknown compatibility-safe fields
- Focused Jest coverage + full `next build`

## Migrations

- **Authored:** none
- **Applied:** none
- **Production data mutation:** none

## Holds respected

- No PR, merge, force-push, production deployment
- No Package 5B / Pantry / Grocery / prepared-batch UI / AI / voice implementation
- No production DDL/SQL

## Stop state

`needs_review`
