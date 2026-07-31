# Package 3 — Canonical Meal / Recipe Contract Map

**Status:** Implementation deliverable (needs review)  
**Base SHA:** `046ea723e7349a017a02984e51b52673a615edf0`  
**Branch:** `feat/meals-recipes-operational-foundation-v1`  
**Governing brief:** `b13fb2a9-b569-4205-8767-ca01e77ffadc`

## Frozen ownership

| Object | Meaning | Persistence |
|---|---|---|
| **Recipe** | Preparation: ingredients, quantities, steps, yield, provenance, nutrition source | `meal_documents` where `kind='recipe'` |
| **Meal** | Reusable eating choice / composition; may reference components/simple foods | `meal_documents` where `kind='meal'` |
| **Imported source** | Staging / review draft before library confirm | `imported_meals` (+ social import jobs) |
| **Log entry** | Observed execution truth | `journal_entries` (grouped via `payload.meal_group`) |

Plans schedule meal *choices* later — Package 3 does not invent plan lifecycle.

## Canonical typed contract (`lib/meals/types.ts`)

| Field group | Contract |
|---|---|
| Identity / ownership | `id`, `person_id` (server-stamped; client owner ids rejected) |
| Classification | `kind: 'meal' \| 'recipe'` + `classifyMealDocumentKind()` |
| Lifecycle | `lifecycle_state: 'active' \| 'archived'`, `archived_at` (document_json only) |
| Review | `review_state: 'draft' \| 'needs_review' \| 'confirmed'` (DB CHECK unchanged) |
| Servings / yield | `yield`, `recipe_yield_servings`, `serving_label` |
| Components | `MealComponent[]` with quantity/unit/food grounding |
| Provenance | `source.source_type`, `source_url` (normalized), import ids/platform/raw text |
| Nutrition honesty | `nutrition_status` + `deriveMealNutritionStatus()`; null ≠ 0 |
| Scaling | `recompute.scaleTopLevelMealNutrition` + `servingScale.scaleComponentQuantities` |

## Service boundary

| Concern | Module |
|---|---|
| Person-scoped write auth | `lib/meals/requireMealLibraryAccess.ts` → Package 2 journal guards |
| Persistence CRUD | `lib/meals/mealDocumentServerService.ts` |
| Safe edit + recompute | `lib/meals/mealDocumentEditService.ts` |
| Search / browse | `lib/meals/mealDocumentSearchService.ts` (excludes archived by default) |
| Import → library | `lib/meals/importToMealDocumentService.ts` |
| Archive / restore | `archiveMealDocumentForPerson` / `restoreMealDocumentForPerson` + `POST .../archive` |
| URL provenance / dedup | `lib/meals/provenance.ts` + `findImportedMealByNormalizedSourceUrl` |
| Legacy adapters | `lib/meals/adapters.ts` + honest probe in `legacyCompat.ts` |

## API surface (canonical)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/journal/meals/documents` | Create; personId from session |
| GET/PATCH | `/api/journal/meals/documents/[id]` | Archived still readable on GET |
| POST | `/api/journal/meals/documents/[id]/archive` | `{ action: 'archive' \| 'restore' }` |
| GET | `/api/journal/meals/documents/search` | Default excludes archived. `archived_only=true` pages past newer active rows for the Archived library view. `include_archived=true` remains a mixed single-page opt-in. |
| POST | `/api/journal/meals/documents/from-import/[id]` | Import → document |
| POST | `/api/journal/meals/documents/[id]/log` | Grouped log |
| POST | `/api/journal/plans/ai/import-recipe` | URL re-import returns existing (`duplicate: true`) |
