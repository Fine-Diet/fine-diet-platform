# Package 4 → Package 5 Dependency Handoff

What the execution vertical slice (Package 5) may safely consume after Package 4.

## Safe to consume

| Capability | How |
|---|---|
| Current plan | `selectCurrentPlan(plans)` / `resolveCurrentPlan(plans)` — `null` when none |
| Integrity conflict diagnostics | `resolveCurrentPlan(...).integrityConflict` + `conflictPlanIds` |
| Plan lifecycle states | `draft` \| `active` \| `archived` as defined in Package 4 contract map |
| Activated generate handoff | `persistAiPlan` returns only after activation; navigate via `buildPostGeneratePlansHomeHref` |
| Planned meal → MealDocument pointer | `payload.source_meal_document_id` + `payload.planned_servings` |
| Archived library reference reads | Existing pointers remain readable via Package 3 GET-by-id |
| Serving scaling | Package 3 `scaleTopLevelMealNutrition` / `scaleMealDocumentForServings` |
| Person-scoped plan writes | Server-resolved `personId` only; fail closed |

## Do not invent in Package 5 from Plans layer

- Treating draft/incomplete generates as current
- Falling back to `plans[0]` when no active plan exists
- Mutating plan `status` via generic PATCH — use `action: "archive" | "activate"` only
- Hard-deleting plans via public DELETE — retirement is archive-only; historical rows must remain readable
- Attaching archived MealDocuments as new plan items
- Treating payload snapshots as canonical meal truth (`meal_document_snapshot` is resilience only)
- Converting nutrition null → 0
- Pantry / Grocery / Programs / NDS redesign
- Applying `activate_generated_plan` or slot unique-index DDL without a separate approved migration

## Recommended execution consumption shape

```ts
const resolution = resolveCurrentPlan(plans);
if (!resolution.plan) {
  // empty / no current intention — do not invent
}
// Log/execute against planned_meals under resolution.plan.id
// Prefer re-reading MealDocument by source_meal_document_id when present
```

## Holds carried forward

- Activation RPC not applied in production from Package 4
- Multiple-active rows may still exist historically; resolver is the compatibility layer
