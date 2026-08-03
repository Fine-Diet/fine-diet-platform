# Package 5B → Package 6 / 7 Dependency Handoff

What later packages may safely consume after Package 5B grocery demand expansion.

## Safe to consume

| Capability | How |
|---|---|
| Typed grocery expansion | `deriveItemsFromMeals(..., { resolveRecipe })` via `expandPlannedMealToDemandCandidates` |
| Person-scoped recipe loads | `loadPersonScopedRecipeResolver(personId, meals)` |
| Demand leaves | Flatten emits `direct_component` / `recipe_ingredient` / unresolved; `recipe_portion` structural |
| Portion/yield scaling | `scaleRecipeIngredientQuantity` / `resolveGroceryRecipeYield` in `componentExpansion.ts` |
| Contributor provenance | `DerivedItem.contributors` + `source_detail_json.expansion_contributors` |
| Nested boundary | One-level only; nested recipe refs become unresolved with `NESTED_RECIPE_BOUNDARY_NOTE` |
| Legacy meals | `items[]` still hydrates through `plannedMealToMealDocument` when `typed_components` absent |

## Deterministic demand shape (now live)

```text
Planned meal
  → MealDocument (typed_components preferred)
  → expandMealComposition(+ person-scoped resolveRecipe)
  → demand leaves (scaled recipe ingredients)
  → aggregate by food_object_id::unit or exact name::unit
  → grocery_items (+ expansion_contributors detail)
```

## Do not invent in Package 6/7

- Merging grocery rows by display name across different `food_object_id`s
- Cross-dimension unit conversion without an explicit measure lattice
- Pantry deduction without identical normalized units + canonical identity
- Mutating meal/recipe snapshots during grocery derivation
- Silent multi-level nested recipe expansion without a cycle-safe design
- Treating expansion provenance JSON as a substitute for a future typed schema without a migration decision

## Deferred / reserved for later packages

- Full Pantry lots / location / expiry
- Prepared-batch inventory (`component_kind: 'prepared_batch'`)
- Nested recipe recursive expansion with cycle detection beyond the one-level boundary
- Rich grocery UI for expansion contributor chips (data is already in `source_detail_json`)
- Product/package optimization and shopping collaboration
- AI / voice capture paths (must call the same derivation services)

## Nested recipe policy (explicit)

Package 5B expands **one level** of recipe ingredients. If a recipe ingredient is itself a `recipe_document`, demand emits an unresolved nested-recipe row with note:

`nested recipe expansion deferred (cycle-safe one-level boundary)`

Package 6/7 may deepen this only with an explicit cycle-safe recursive design and regression coverage.
