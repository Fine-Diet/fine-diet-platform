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

## Out of scope for this QA

- Full Pantry lots / prepared batches
- Grocery collaboration / household sharing
- Product/package optimization
- Nested recipe multi-level expansion (one-level boundary is intentional)
