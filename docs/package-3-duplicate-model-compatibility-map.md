# Package 3 — Duplicate Model & Compatibility Map

## Parallel models (still present)

| Model | Location | Status after Package 3 |
|---|---|---|
| `MealDocument` | `meal_documents` / `lib/meals/*` | **Canonical** library object |
| `MealTemplate` | `journal_meal_templates` / legacy `/api/journal/meals` | Legacy; read via adapters; hard DELETE remains on legacy path only |
| `ImportedMeal` | `imported_meals` | Staging only; converts to MealDocument |
| `PlannedMeal.payload` | `planned_meals` | Plan instance (Package 4); adapt via `adapters.ts` |
| Eat-out attachable | plans types | Adapt via `eatOutPayloadToMealDocument` |

## Compatibility adapters (`lib/meals/adapters.ts`)

| Direction | Function |
|---|---|
| Saved meal → document | `mealTemplateToMealDocument` |
| Import → draft document | `importedMealToMealDocumentDraft` |
| Planned ↔ document | `plannedMealToMealDocument` / `mealDocumentToPlannedMealPayload` |
| Document → grouped log | `mealDocumentToLoggedMealGroup` |
| Macro key drift | `macrosFromJournal` / `macrosFromSnake` / `macrosFromCompat` |

## Honesty rules (Package 3)

1. **Unknown shapes** — `probeLegacyMealShape` returns `ok: false` instead of inventing fields.
2. **Null macros** — prefer `macrosToSnakeNullable`; `macrosToSnakeTotals` zero-fill is legacy-only and documented.
3. **Kind inconsistency** — `classifyMealDocumentKind` surfaces mismatch; does not rewrite `kind`.
4. **Archived refs** — GET by id still returns archived documents; search excludes them by default.

## Duplicate import policy

| Level | Behavior |
|---|---|
| Same URL → `imported_meals` | Exact normalized URL match, then paginated compatibility scan of historical raw URLs; reuse existing row; HTTP 200 + `duplicate: true` |
| Same `imported_meal_id` → `meal_documents` | Idempotent upsert (pre-existing); **archived lifecycle preserved** on re-save / yield-confirm |
| Text / non-URL capture | New staging row (content-hash dedup deferred — schema proposal) |

### Concurrency / uniqueness caveat

Application-only check-then-insert **does not guarantee** concurrent uniqueness. Two parallel imports of the same URL can still race and insert duplicates until the proposed unique index on `normalized_source_url` (see `docs/package-3-schema-proposal.md`) is approved and applied. Package 3 makes sequential re-import deterministic; it does not claim race-free uniqueness without DDL.
