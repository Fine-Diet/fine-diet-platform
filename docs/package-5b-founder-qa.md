# Package 5B — Founder QA Script

Canonical story: **Chicken Sausage + English Muffin + Smoothie Breakfast**

Preview must be pinned to the Package 5B evidence SHA listed in `docs/package-5b-execution-report.md`.

## Preconditions

1. Open the READY preview for `feat/typed-plan-grocery-expansion-v1`.
2. Sign in as the founder person.
3. Confirm a saved recipe **Morning Smoothie** exists with ingredient quantities and a confirmed yield (or positive `recipe_yield_servings`).
4. Create or open a plan day that contains one pending planned meal with:
   - direct chicken sausage portion
   - direct English muffin portion
   - one serving of **Morning Smoothie** (`component_kind: recipe_document`)

## QA steps

1. **Generate grocery** for the plan/date containing that breakfast (force regenerate if a list already exists).
2. Confirm the list shows:
   - chicken sausage demand
   - English muffin demand
   - Morning Smoothie **ingredient** requirements (not only a single “Morning Smoothie” buy line)
3. Open notes / contributor context on a smoothie-derived row and confirm it references the breakfast and Morning Smoothie edge.
4. Change the smoothie portion quantity on the planned meal (e.g. 1 → 2 servings), regenerate grocery, and confirm ingredient demand scales deterministically.
5. Reopen the saved meal/plan composer and confirm the recipe snapshot/title/version were **not** rewritten by grocery generation.
6. If any smoothie ingredient is ungrounded (no `food_object_id`), confirm it remains visibly unresolved rather than disappearing or inventing identity.
7. Confirm pantry deduction still only applies when a grocery row and pantry row share the same `food_object_id` and exact normalized unit.

## Pass criteria

- Direct + recipe-expanded demand both visible
- Provenance/contributor context sufficient for the breakfast → smoothie edge
- Quantity scaling deterministic
- No snapshot mutation
- Unresolved honesty preserved
- No Pantry rule loosening

## Correction re-check (stale template pointer)

1. Apply **Standard Day V1** (blank/reusable day template) onto a plan day.
2. Confirm apply succeeds even if one saved-meal pointer is missing in `meal_documents`.
3. Confirm the breakfast meal lands with its embedded payload intact (sausage/muffin/smoothie composition as stored on the template).
4. Confirm other template meals that still point at live MealDocuments keep their valid pointers.
5. Confirm composer/manual “attach library MealDocument” still rejects missing/cross-person/archived ids (strict gate unchanged).

## Correction re-check (slot fidelity — Aug 2-compatible shapes)

Use a generated target day whose slots look like:

| ordinal | block | label | time |
|---|---|---|---|
| 0 | morning | Breakfast | 10:00:00 |
| 1 | midday | Lunch | 14:00:00 |
| 2 | midday | Afternoon snack | 15:30:00 |
| 3 | evening | Dinner | 18:00:00 |

Against **Standard Day V1** (1-based source slots with `HH:MM` times):

1. Apply the template (append confirm if the day already has stub meals).
2. Confirm Breakfast lands in Breakfast (not Lunch).
3. Confirm Lunch / Combined meal lands in Lunch (not Afternoon snack).
4. Confirm Dinner / Morning Smoothie lands in Dinner (not unassigned), unless there is an explicit placement conflict note.
5. Confirm no two template meal slots silently share one target slot.
6. If a placement cannot resolve, the meal remains present as unassigned with `placement_review_note` — never dropped.

## Correction re-check (Pull from Plan — range-aware selection)

On a persistent list (`Today` or `My Grocery List`; `mode=manual`, `plan_id=null`):

1. **Today / through Monday (Aug 2–3 window):** open Pull from Plan. Picker should default to **Week of Aug 2, 2026 (archived, …)** — not Week of Aug 9. Pull should add `planned_meal` rows (or an honest empty reason, never “Added … pending needs” with zero inserts).
2. **Explicit Aug 2–Aug 5:** same archived week auto-selected; pull yields non-empty demand when pending meals have items/typed components; rows keep `source_id` = archived plan id.
3. **Aug 9–15:** picker defaults to **Week of Aug 9, 2026 (active, …)**.
4. Manually select archived Aug 2, then nudge dates inside Aug 2–8 — selection stays. Move dates into Aug 9–15 — selection rebinds to Aug 9 (or clears with “No plan overlaps…”).
5. With active Aug 9 selected and dates Aug 2–5, pull must show an honest empty reason (no plan days), not success copy.

## Out of scope for this QA

- Full Pantry lots / prepared batches
- Grocery collaboration / household sharing
- Product/package optimization
- Nested recipe multi-level expansion (one-level boundary is intentional)
- Production repair/mutation of the stored Standard Day V1 template row
