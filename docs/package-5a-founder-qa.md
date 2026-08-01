# Package 5A — Founder QA Script

Use the READY preview pinned in `docs/package-5a-execution-report.md` and the clean QA account.

## Routes

1. Meal Library: `/app/food/meals`
2. Create meal (composer): open **Add meal** from Meal Library
3. Edit meal: open an existing meal → **Edit**
4. Planning attach: Plans day/slot → **From saved meals** (or template saved-meal picker)

## Script

1. Confirm saved **Morning Smoothie** Recipe is available under Recipes.
2. Create **Chicken Sausage + English Muffin + Smoothie Breakfast** (or reconstruct).
3. Add chicken sausage as a direct food/product portion (Search & add).
4. Add one English muffin as a direct food/product portion.
5. Add one serving of Morning Smoothie via **Add saved Recipe**.
6. Confirm the smoothie row shows **Recipe reference** and a version token.
7. Save the Meal — UI must only succeed after a returned document id.
8. Refresh the page and reopen the meal.
9. Confirm all three components, identities, and portions remain.
10. Edit one direct portion quantity and the smoothie portion to 2 servings; save; reopen.
11. Confirm smoothie still shows the same recipe id/version/snapshot title (not silently rewritten by later recipe edits).
12. Select the saved Meal as a planning source; confirm the composed meal pointer and recipe-reference component survive (typed composition preserved).

## Out of scope for this QA

- Grocery expansion / pantry deduction
- Voice / AI capture
- Prepared-batch inventory UI
