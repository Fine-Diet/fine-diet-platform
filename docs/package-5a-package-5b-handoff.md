# Package 5A → Package 5B Dependency Handoff

What Package 5B (grocery demand expansion) may safely consume after Package 5A.

## Safe to consume

| Capability | How |
|---|---|
| Typed meal components | `MealComponent.component_kind` + `component_id` |
| Recipe portions in meals | `component_kind: 'recipe_document'` with live id + version token + snapshots |
| Planning composition | `planned_meals.payload.typed_components` (preferred) + pointer fields |
| Expansion contract | `expandMealComposition(doc, { resolveRecipe, plan_id, ... })` |
| Grocery provenance IDs | `GroceryDemandProvenanceContract` on every expansion edge |
| Food vs product hint | `food_concept` / `product_variant` (still backed by `food_object_id`) |
| Archived recipe reads | GET-by-id remains; new attaches rejected |

## Deterministic expansion shape (5B target)

```text
Meal portion
  → direct food/product demand
  → recipe portion
  → recipe ingredient requirements
  → food concepts/products
```

Call `expandMealComposition` with a person-scoped `resolveRecipe` loader. Do not flatten recipe truth into grocery lines without provenance.

## Do not invent in Package 5B

- Treating `payload.items[]` as the only composition source when `typed_components` exists
- Inferring recipe references from display names
- Mutating saved meal/recipe snapshots when expanding demand
- Pantry deduction without compatible identity + unit confidence
- Voice/AI write paths that bypass typed domain services
- Applying speculative production DDL without evidence

## Deferred (still reserved)

- Preparation transformation persistence/UI
- Prepared-batch inventory UI (`component_kind: 'prepared_batch'`)
- Full food_concept / product_variant graph split beyond `food_objects.sourceType`
- Native / AI / voice clients (must call the same services)
