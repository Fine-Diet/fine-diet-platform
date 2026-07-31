# Package 3 → Package 4 Dependency Handoff

What Plans may safely consume after Package 3.

## Safe to consume

| Capability | How |
|---|---|
| Library meal/recipe identity | `meal_documents.id` + `kind` |
| Person-scoped reads | `getMealDocumentForPerson` / search (active by default) |
| Referenced archived reads | GET by id still works when archived |
| Provenance | `source.source_url` (normalized when parseable), `source_imported_meal_id` |
| Nutrition honesty | `nutrition_status` or `deriveMealNutritionStatus(doc)` — do not invent |
| Serving scaling | `scaleTopLevelMealNutrition` + `scaleMealDocumentForServings` (pure; no mutate) |
| Adapters into plan payload | `mealDocumentToPlannedMealPayload` |
| Auth pattern | Server-resolved `personId` only; fail closed |

## Do not invent in Package 4 from Meal/Recipe layer

- Plan lifecycle (`draft` / `active` / `archived` uniqueness) — Plans owns this
- Activation RPC / generation orchestration
- Grocery / pantry / NDS redesign
- Treating archived library rows as browsable defaults
- Treating `macrosToSnakeTotals` zeros as measured nutrition
- Client-authored `person_id` on meal or plan writes

## Recommended Plans consumption shape

```ts
// Conceptual — Plans should store a pointer, not a second meal model:
{
  source_meal_document_id: string; // required when attaching a library item
  consumed_or_planned_servings: number;
  // snapshot optional for offline/history; prefer re-read document when active
}
```

When a document is archived after being planned, Plans should keep the pointer readable via GET-by-id and decide product UX (warn vs block) — Package 3 does not delete.
