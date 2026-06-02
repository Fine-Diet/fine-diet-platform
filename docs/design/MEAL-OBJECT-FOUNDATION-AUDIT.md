# Fine Diet Meal Object Foundation — Contract + Data Flow Audit

**Status:** Architecture / audit packet. No logging behavior is implemented here.
**Goal:** Establish a canonical meal object foundation before the meal/nutrition logging pages are configured.

Source of truth (external strategy docs, not in repo):
- Fine Diet Meal Object Foundation — Strategy Packet: `ea0ceeb8-3c45-4188-bea4-0733d834713d`
- Fine Diet Meals — Storage and Logging Standardization Review: `345793fb-b6b2-41d1-8d15-19a87e255694`

> Note: The two referenced UUIDs are not present in the repo or the local agent-transcript
> store. This audit was produced against the embedded product decisions/rules in the packet
> brief plus a full read of the live codebase. If the strategy packets contain additional
> constraints, reconcile them against §3 (Canonical Types) before implementation.

---

## 0. TL;DR

There are **four** independent "meal/recipe container" shapes and **at least four** independent
"ingredient/item" shapes in the codebase today. They overlap heavily but disagree on field names,
units, and nutrition basis. The logging path is **lossy in two opposite directions**:

- **Apply Saved Meal** → *explodes* one saved meal into N flat `journal_entries` rows (decision #5 violated).
- **Execute Planned Meal** → *collapses* a multi-item meal into ONE `journal_entries` row carrying only `totals` (items are discarded from the log).

Neither preserves a meal as a **grouped first-level log entry that still knows its components**.

The fix is **not** a new Recipes silo and **not** a log-page redesign. It is:

1. A single canonical **`MealComponent`** (ingredient/item) type.
2. A single canonical **`MealDocument`** type (the reusable recipe/meal in Meal Library).
3. A single canonical **logged-meal grouping** added to `journal_entries` as a **versioned JSONB `meal_group`** payload extension — *no new top-level rows per ingredient*, *no destructive migration*.
4. A capture/import **review pipeline** that already exists (`imported_meals`) extended to accept all sources (URL/text/photo/screenshot/label/menu/barcode/manual) and funnel into one review → confirm-yield → canonical document step.
5. Search **modes** (All / Foods / Meals / Recipes / Restaurants / History) layered **beside** branded food search using the existing parallel-section pattern — branded retrieval untouched.

---

## 1. Inventory — existing meal-related systems

### 1.1 Tables

| Table | Defined in | Role today | Grouping model |
|---|---|---|---|
| `journal_entries` | `scripts/createJournalTables.sql` (+ `addJournalEntryQuantityG.sql`, NDS column migrations) | The log. One row per logged food. `entry_type='intake'`, `payload` JSONB, `quantity_g`, NDS derived columns. | **Flat. No grouping.** |
| `journal_meal_templates` | `scripts/createJournalTables.sql` | "Saved Meals" bank. `items` JSONB array, `nutrition_density`. | `items[]` inside one row |
| `planned_meals` | `scripts/createPlansTables.sql` (+ `addPlannedMealExecutionState.sql`, `addPlannedMealReusableProvenance.sql`) | Planned eating instances on a plan slot. `payload` = `{ items[], totals }`, NDS columns, `execution_state`, `journal_entry_id`, `source_template_id`, `source_imported_meal_id`. | `payload.items[]` + `totals` |
| `imported_meals` | `scripts/createPlansTables.sql` + Phase-4 columns (see §1.5 gap) | Import/review drafts. `parsed_payload_json` (review draft), `payload` (attachable), `nutrition_estimate_json`, `ingredient_match_json`, `parse_status`. | dual: draft `ingredients[]` + attachable `items[]` |
| `imported_menus` | `scripts/createPlansTables.sql` + `addPlansPhase5Columns.sql` | Restaurant menu drafts. `parsed_payload_json.sections[].items[]`. | menu sections |
| `planned_eat_out_events` | `scripts/createPlansTables.sql` | best/better/fallback recommendation payload bound to a slot. | recommendation options |
| `plans` / `plan_days` / `plan_slots` | `scripts/createPlansTables.sql` | Planning skeleton. | structural |
| `generated_grocery_lists` / `grocery_items` / `pantry_on_hand_items` | `scripts/createPlansTables.sql` | Grocery + pantry. `grocery_items.food_object_id`, `source_planned_meal_ids[]`. | line items |
| `ingredient_source_events` | `scripts/addPlansPhase28IngredientSourceEvents.sql` | Audit of per-ingredient source apply/reject. | event log |
| `social_import_jobs` | `scripts/sql/createSocialImportTables.sql` | Social URL import lane → `imported_meal_id`. | job |
| `food_objects` | (USDA/OFF ingestion scripts) | Canonical food/nutrient reference. Branded search source. | reference |
| `daily_nds` | `scripts/sql/createDailyNDSTables.sql` | Daily 0–100 NDS + 7 subscores. | derived/day |
| `reusable_plan_day_templates` / `reusable_plan_week_patterns` | `scripts/sql/createReusablePlanningTables.sql` | Day/week reusable plan snapshots. | snapshots |

### 1.2 Domain types

| Type | File | Notes |
|---|---|---|
| `JournalEntryPayload` / `IntakePayload` | `lib/journal/journalServerService.ts` (31–50), `lib/journal/types.ts` (52–63) | Flat food. `macros:{protein,carbs,fat}` (no `_g`). `foodObjectId` (camelCase). per-serving + `quantity` multiplier. |
| `MealTemplate` / `MealTemplateItem` | `lib/journal/types.ts` (159–174), `lib/journal/journalServerService.ts` (83–107) | Saved-meal item. Two divergent definitions (full vs minimal). |
| `PlannedMeal` / `PlannedMealPayload` | `lib/plans/types.ts` (205–266) | `payload` is open `Record<string,unknown>`, schema enforced by Zod in `lib/plans/validators.ts`. NDS required via `MealNDSShape`. |
| `ImportedMeal*` (`ImportedMealDraftPayload`, `ImportedMealDraftIngredient`, `NutritionEstimate`, `IngredientMatchEntry`) | `lib/plans/types.ts` (588–850) | Richest ingredient model: `raw_text`, `normalized_name`, `quantity_value`, `quantity_unit`, `parse_confidence`, `quantity_source`, grounding/match status. |
| `EatOutAttachableItem` / `EatOutAttachablePayload` | `lib/plans/types.ts` (389–411) | `macros:{protein_g,carbs_g,fat_g}` (WITH `_g`), `food_object_id` (snake). |
| `MealDerivedData` / `NDSSubscores` / `MealNDSShape` | `lib/nds/types.ts`, `lib/plans/types.ts` (47–58) | Deterministic NDS contract shared projected↔journaled. |
| `FoodObject` / `FoodSearchResult` / `SectionKey` | `lib/food/types.ts` | Branded search + section model. |
| `Measure` / `ConversionResult` | `lib/units/convert.ts` | Deterministic unit→grams conversion. |

### 1.3 APIs

| Surface | Endpoint(s) | File |
|---|---|---|
| Journal entries CRUD | `POST/GET /api/journal/entries`, `PATCH/DELETE /api/journal/entries/[id]` | `pages/api/journal/entries/*` |
| Saved meals CRUD | `GET/POST /api/journal/meals`, `GET/PATCH/DELETE /api/journal/meals/[id]` | `pages/api/journal/meals/*` |
| History / repeat | `GET /api/journal/history`, `GET /api/journal/repeat` | `pages/api/journal/history.ts`, `repeat.ts` |
| Food search | `GET /api/foods/search` | `pages/api/foods/search.ts` → `lib/food/foodServerService.searchFoods` |
| UPC lookup | `GET /api/foods/upc/[code]` | `pages/api/foods/upc/[code].ts` → `lookupByUpc` |
| Recipe import | `POST /api/journal/plans/ai/import-recipe` | `pages/api/journal/plans/ai/import-recipe.ts` |
| Import drafts | `GET /api/journal/plans/imports/meals`, `[id]` GET/PATCH, `[id]/save`, `[id]/ingredients/[idx]/*`, `[id]/source-search` | `pages/api/journal/plans/imports/meals/**` |
| Menu import / eat-out | `POST /ai/import-menu`, `POST /ai/recommend-menu-picks`, `GET /eat-out/[id]`, `POST /eat-out/[id]/select` | `pages/api/journal/plans/**` |
| Planned meal CRUD + execute | `POST /api/journal/plans/meals`, `POST /api/journal/plans/meals/[mealId]/execute` | `pages/api/journal/plans/meals/**` |
| Reusable templates | `/api/journal/plans/templates/*` | `pages/api/journal/plans/templates/**` |

### 1.4 UI surfaces

| Surface | File | Notes |
|---|---|---|
| **Primary log page** | `pages/journal/log.tsx` (~2300 lines) | Search/UPC/history/saved-meals tabs; renders one `LoggedItemCard` per entry. |
| Logged item card | `components/journal/LoggedItemCard.tsx` | Single food line. No nested items UI. |
| Saved meal card | `components/journal/SavedMealCard.tsx` | Carousel tap target. |
| Day view | `pages/journal.tsx` + `components/journal/JournalBlockSection.tsx` | Block summaries (comma-joined line), not per-item cards. |
| Saved-meal create/list/edit | `pages/journal/meals/create.tsx`, `index.tsx`, `edit/[id].tsx` | Uses `AddItemsPanel.tsx` (flat search). |
| Barcode scanner | `components/journal/BarcodeScanner.tsx` | `html5-qrcode`, UPC/EAN/CODE-128. |
| Import new/review | `pages/journal/plans/imports/new.tsx`, `[id].tsx`, `social/*` | Text/URL/video. No photo upload UI today. |
| Eat-out | `pages/journal/plans/eat-out/new.tsx`, `[id].tsx` | Restaurant name + menu paste/URL. |
| Plans slot editor | `components/journal/plans/SlotEditor.tsx` | Attaches template/import to a slot; servings scaling. |
| Admin image picker | `components/admin/ImagePickerModal.tsx` | Marketing asset library only — NOT food OCR. |

### 1.5 Known schema gap

`imported_meals` Phase-4 columns (`import_type`, `source_platform`, `raw_input_text`, `parse_status`,
`parsed_payload_json`, `nutrition_estimate_json`, `ingredient_match_json`) are **read/written by code**
(`lib/plans/importsServerService.ts`) but have **no checked-in `ALTER TABLE` migration** under `scripts/`.
They exist only in the deployed DB. Any new migration packet must first **codify the current live schema**
before adding to it. (QA item — see §11.)

---

## 2. Overlapping / conflicting shapes

### 2.1 Container shapes (four)

```
journal_meal_templates.items[]        // Saved Meal — full per-item nutrition, camelCase
planned_meals.payload                 // { items[], totals, notes_md? } — plans
imported_meals.payload                // { items[], totals } attachable  + parsed_payload_json (draft)
EatOutAttachablePayload               // { meal_type, items[], totals } — eat-out
```

All four are "a named meal with a list of components and rolled-up totals." They are not interchangeable.

### 2.2 Component/ingredient shapes (four+)

| Shape | name field | qty field | unit field | macros field | food link |
|---|---|---|---|---|---|
| `IntakePayload` / `MealTemplateItem` | `name` | `quantity` | `unit` | `macros.{protein,carbs,fat}` | `foodObjectId` |
| `ImportedMealDraftIngredient` | `normalized_name` / `raw_text` | `quantity_value` | `quantity_unit` | (none on draft) | via `IngredientMatchEntry.source_id` |
| `IngredientMatchEntry` | `normalized_name` | `quantity_value` | `quantity_unit` | `per_serving_estimate.{calories,protein_g,...}` | `source_id` + `source_kind` |
| `EatOutAttachableItem` | `name` | `quantity` | `unit` | `macros.{protein_g,carbs_g,fat_g}` | `food_object_id` |

**Conflicts:**
- **Macros key drift:** `protein` vs `protein_g`. Same number, different key, across journal vs plans/eat-out.
- **Food link key drift:** `foodObjectId` (camel, journal) vs `food_object_id` (snake, plans).
- **Nutrition basis ambiguity:** journal stores **per-serving** macros + a `quantity` multiplier; plans/eat-out totals are **absolute**; imports are **per-serving estimate**. No single field marks the basis.
- **Name semantics:** `name` (display) vs `normalized_name`/`raw_text` (parse provenance).

### 2.3 Logging grouping conflict (the core problem)

| Flow | Result in `journal_entries` | Decision impact |
|---|---|---|
| Apply Saved Meal (`handleApplySavedMeal`, `log.tsx`) | N rows, one per item; no parent link | ❌ violates #5 (ingredient pile) |
| Execute Planned Meal (`executePlannedMeal`, `planServerService.ts`) | 1 row from `totals` only; items dropped | ⚠️ grouped but lossy (cannot edit components, cannot recompute) |
| Log single food | 1 row | ✓ fine for single foods |

Neither path produces a **grouped meal that retains its components** in the log. That is the gap the canonical model must close.

---

## 3. Recommended canonical types

> Design stance: **versioned JSONB first**, additive, non-destructive. These types are the
> *target contract*; they are introduced behind adapters so existing flat foods keep working.

### 3.1 Canonical ingredient — `MealComponent`

One component type used by recipes, planned meals, logged meal groups, imports, and eat-out.

```ts
/** Canonical nutrition basis flag — removes the per-serving vs absolute ambiguity. */
export type NutritionBasis = 'per_component' | 'per_serving';

/** Canonical macros — single key spelling everywhere (`_g`). */
export interface CanonicalMacros {
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g?: number | null;
  added_sugar_g?: number | null;
}

export interface MealComponent {
  /** Stable id within the document/instance (not a DB row id). */
  component_id: string;
  /** Display name. */
  name: string;
  /** Parse provenance, when the component came from import/extraction. */
  raw_text?: string | null;
  normalized_name?: string | null;

  /** Amount the user is consuming/preparing, in `unit`. */
  quantity: number | null;
  unit: string | null;               // 'serving' | 'g' | measure unit (cup, oz, ...)
  /** Canonical grams when resolvable via food_objects.measures/serving_size_g. */
  quantity_g?: number | null;

  /** Grounding: link to canonical food. Single snake_case spelling. */
  food_object_id: string | null;
  /** How this component's nutrition was grounded. Mirrors IngredientMatchEntry. */
  match_status: 'matched' | 'partial' | 'guessed' | 'none';
  source_kind: 'food_object' | 'heuristic_guess' | 'default_guess' | 'user_entered';

  /** Nutrition contributed by THIS component at the stored quantity. */
  calories: number | null;
  macros: CanonicalMacros;
  /** Whether `calories`/`macros` are per the component amount or per one serving of the parent. */
  nutrition_basis: NutritionBasis;

  /** Review flags — drives recompute policy (§5). */
  needs_review: boolean;
}
```

`IngredientMatchEntry`, `ImportedMealDraftIngredient`, `MealTemplateItem`, `EatOutAttachableItem`,
and `IntakePayload` all map onto `MealComponent` via thin adapters (no data loss; review/grounding
fields default sanely for legacy rows).

### 3.2 Canonical document — `MealDocument` (recipe **and** reusable meal)

A single document type, **not** two silos. A "recipe" is a `MealDocument` with prep `steps` and a
`yield`; a "reusable meal" is a `MealDocument` without steps. Meal Library is the home for both.

```ts
export type MealDocumentKind = 'recipe' | 'meal';   // 'recipe' = has prep steps/yield; 'meal' = assembled set
export type MealDocumentStatus = 'draft' | 'confirmed';  // draft until yield is confirmed (decision #4)

export interface MealYield {
  /** Number of servings the prepared batch produces. */
  servings: number | null;
  /** Optional human label of the batch unit (e.g. "2 loaves", "1 pot"). */
  yield_label?: string | null;
  /** True once the user has explicitly confirmed yield (gates 'confirmed'). */
  confirmed: boolean;
}

export interface MealDocument extends NDSVersionStamp, MealNDSShape {
  id: string;
  person_id: string;

  kind: MealDocumentKind;
  status: MealDocumentStatus;

  title: string;
  description: string | null;

  /** The component list (ingredients for recipes, items for assembled meals). */
  components: MealComponent[];
  /** Prep steps — recipes only; never enter the nutrition path. */
  steps?: { step_number: number; instruction: string }[];

  /** Yield/serving definition (recipes). null for single-serving assembled meals. */
  yield: MealYield | null;

  /** Rolled-up nutrition for ONE serving (deterministic when grounded). */
  per_serving: { calories: number | null; macros: CanonicalMacros };
  nutrition_basis_confidence: NutritionEstimateConfidence;  // high|medium|low

  /** Import provenance (null for hand-built docs). */
  source_imported_meal_id: string | null;
  source_type: 'manual' | 'url' | 'video' | 'photo' | 'label' | 'menu' | 'barcode' | 'chat';

  schema_version: number;            // versioned JSONB stamp
  created_at: string;
  updated_at: string;
}
```

### 3.3 Planned meal instance — extend, don't replace

`planned_meals` already exists and is correct in spirit. Canonicalize its `payload`:

```ts
export interface PlannedMealInstancePayload {
  schema_version: number;
  /** Optional pointer back to the reusable document this was instantiated from. */
  source_meal_document_id: string | null;
  /** Servings of the source doc planned for this slot (decision #6 / scaling). */
  planned_servings: number;
  components: MealComponent[];        // scaled to planned_servings
  totals: { calories: number; macros: CanonicalMacros };
  notes_md?: string | null;
}
```

Keeps `execution_state`, `journal_entry_id`, NDS columns as-is.

### 3.4 Logged meal instance — the new grouped log entry (no new top-level rows)

A logged meal is **one** `journal_entries` row (`entry_type='intake'`) whose payload carries a
`meal_group`. This satisfies decision #5 (grouped first-level entry) **and** decision #6 (edit this
instance vs the source) **and** avoids exploding into ingredient piles — all via **versioned JSONB**,
no destructive migration.

```ts
export interface LoggedMealGroup {
  schema_version: number;
  /** Display name of the meal as logged. */
  name: string;
  /** Components actually eaten (scaled to logged_servings). */
  components: MealComponent[];
  /** Rolled-up totals for the logged amount (what NDS/day math consumes). */
  totals: { calories: number; macros: CanonicalMacros };

  /** Provenance + edit-scope support (decision #6). */
  source_meal_document_id: string | null;
  source_planned_meal_id: string | null;
  /** How many servings of the source doc were logged. */
  logged_servings: number;
  /** Set true when the user edited THIS instance away from the source. */
  detached_from_source: boolean;
}

/** journal_entries.payload for a grouped meal entry. */
export interface GroupedMealEntryPayload {
  name: string;                 // existing field — meal name shows as the entry title
  calories?: number;            // existing field — = meal_group.totals.calories (back-compat)
  macros?: { protein?: number; carbs?: number; fat?: number };  // existing — mirror of totals
  quantity?: number;            // existing — stays 1 for a logged meal
  unit?: string;                // existing — 'serving'
  source_planned_meal_id?: string;
  /** NEW: grouped meal payload. Absence ⇒ legacy flat single-food entry. */
  meal_group?: LoggedMealGroup;
}
```

**Why this shape:**
- A grouped meal is still **one** journal row → day view, NDS day math, and `LoggedItemCard` keep working unchanged (they read the existing `name`/`calories`/`macros`).
- The `meal_group.components[]` lets a future (not-this-packet) log redesign expand a meal into its parts **without** creating extra rows.
- `detached_from_source` cleanly encodes "edit this instance only" vs "update the saved recipe."
- Single foods remain exactly as today (`meal_group` absent).

### 3.5 Canonical glossary (decision #6 terms)

| Term | Definition | Lives on |
|---|---|---|
| **Yield** | Total servings a prepared recipe batch produces. | `MealDocument.yield.servings` / `yield_label` |
| **Serving** | One unit of consumption derived from yield. Nutrition is normalized per-serving. | `MealDocument.per_serving` |
| **Prep amount** | The batch quantity actually prepared (may differ from document yield). | future `prepared_batch.servings` (Pantry/leftovers packet — not now) |
| **Planned portion** | Servings of a document scheduled into a plan slot. | `PlannedMealInstancePayload.planned_servings` |
| **Logged amount** | Servings actually eaten and recorded. | `LoggedMealGroup.logged_servings` |
| **Leftovers / prepared batch** | `prep amount − consumed`, tracked for re-logging without re-import. | deferred (Pantry/leftovers packet) |

Terms **not yet in the codebase** (confirmed via search): `leftovers`, `prep amount`, `batch`
(in the meal sense). They are defined here but only `yield`/`servings`/`planned`/`logged` are needed
for the first packets; leftovers/prepared-batch is explicitly deferred.

---

## 4. Capture / import pipeline (one funnel)

### 4.1 Current funnel

`imported_meals` is already a review pipeline with: raw input → text acquisition → AI **text
normalization** (not math) → deterministic parse → ingredient grounding → `parsed_payload_json`
draft + attachable `payload` → review UI → `save` (promote to saved meal) / attach to plan.
`parse_status ∈ {pending, parsed, failed, manual_review}`.

### 4.2 Target funnel (all sources → one review pipeline → confirm yield → MealDocument)

```
                       ┌─────────────────────────────────────────────┐
 URL ───────────────►  │                                             │
 Pasted text ───────►  │                                             │
 Camera photo ──────►  │   CAPTURE ADAPTERS (source-specific)        │
 Saved image ───────►  │   - fetch/transcript/OCR/label-parse/menu   │ ──► raw_input + source_type
 Screenshot ────────►  │   - barcode → food_object (see §6)          │
 Nutrition label ───►  │                                             │
 Restaurant menu ───►  │                                             │
 Manual ────────────►  │                                             │
                       └─────────────────────────────────────────────┘
                                          │
                                          ▼
                        imported_meals (parse_status, parsed_payload_json draft)
                                          │  deterministic parse + grounding
                                          ▼
                        REVIEW UI  (edit components, fix grounding, set yield)
                                          │  decision #4: confirm yield
                                          ▼
                        status='confirmed' ──► MealDocument (Meal Library)
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                                ▼
                   add to plan slot                  log now (grouped entry)
                   (PlannedMealInstance)             (LoggedMealGroup)
```

Key rule (decision #4): an import becomes a **canonical MealDocument** only at the
**confirm-yield** step. Before that it is a draft in `imported_meals`. Today `save` promotes to
`journal_meal_templates` *without* a yield gate — the new model adds the gate and writes a
`MealDocument` instead (Meal Library), with `journal_meal_templates` either migrated or adapter-mapped.

### 4.3 Photo / screenshot / label / menu import (decision #8)

- **Photo / saved image / screenshot:** new capture adapter uploads to Supabase Storage, runs an
  OCR/vision **text extraction** step (the existing `lib/plans/onscreenText` extractor pattern), and
  feeds the extracted text into the **same** `import-recipe` normalization+parse path. `source_type='photo'`.
- **Nutrition label:** OCR → label parser produces a **single-component** draft (one food, per-serving
  panel values) with `match_status='none'` + `needs_review=true`; user confirms → optionally promotes to a
  user `food_object`. `source_type='label'`.
- **Restaurant menu photo:** routes to the existing `imported_menus` lane (`source_type='photo'`), then
  the eat-out recommendation path. No change to eat-out contracts.
- **AI usage:** only for **text extraction/normalization** from unstructured input. The nutrition math
  after grounding is deterministic (§5).

---

## 5. Nutrition recompute policy (decisions #7, #8, #9)

> **No AI in routine nutrition math.** AI may only convert unstructured input → structured text/components.

Deterministic primitives that already exist:
- `lib/units/convert.ts` → `computeQuantities` (unit/measure/serving → grams, via `food_objects.measures`/`serving_size_g`).
- `lib/nds/mealDerived.ts` → `computeMealDerivedData` / `computeMealDerivedFromPayload` (PSQ, protein score, is_main_meal).
- `lib/nds/dailyCalculator.ts` → daily NDS.
- `lib/plans/ingredientMatcher.ts` → grounding + per-serving aggregation.

### Policy table

| Component state | Conversion data | Recompute behavior | Confidence |
|---|---|---|---|
| `match_status ∈ {matched, partial}` AND `food_object_id` set AND unit resolvable to grams (serving/g/known measure) | trusted | **Deterministic recompute** from `food_objects` nutrients × grams. Math only. | high (matched) / medium (partial) |
| `source_kind='user_entered'` with explicit macros | n/a (values given) | **Use as entered**, scale linearly by quantity. Deterministic. | high if label/manual, else medium |
| `match_status='guessed'` (heuristic) | weak | **Preserve last estimate**, mark `needs_review=true`. No silent recompute. | low |
| `match_status='none'` OR unit not convertible (free-text amount) | none | **Preserve + flag review.** Do not recompute. Do not invent numbers. | low |

Rules:
1. Recompute fires **only** when every contributing component is in a deterministic state; otherwise
   recompute the deterministic subset and surface the meal as **needs review** for the rest.
2. Recompute is triggered by: grounding change (apply/reject source), quantity/unit/yield edit,
   `food_objects` version bump. Triggered server-side; results stamped with `nds_version`/`classifier_version`.
3. The meal-level `nds_confidence` (high/medium/low) is derived from component grounding coverage —
   **distinct** from food trust (`FoodResultSource`). This separation already exists; preserve it.
4. `detached_from_source` logged meals recompute against their own components, not the source document.

---

## 6. Barcode / product-code in the add/import pipeline (decision #7, #10)

**Barcode does not change branded food search.** It is a *resolution* step, not a search mode.

- Scan (`BarcodeScanner.tsx`) → `GET /api/foods/upc/[code]` → `lookupByUpc`:
  1. internal `food_objects.upc` (prefer real over provisional),
  2. Open Food Facts,
  3. provisional `food_object` (`source_type='provisional'`) if allowed.
- Resolved `food_object` → either:
  - **direct single-food log** (today's behavior — unchanged), or
  - **a `MealComponent`** appended to an in-progress meal/import draft (new — feeds the review pipeline).
- Provisional/scanned items continue to appear in the existing **`scanned`** section of text search via
  `determineSectionKey` — **no change** to branded retrieval or scoring.
- A "product code" that isn't a barcode (e.g. restaurant item code) is treated as a manual component, not a UPC lookup.

---

## 7. Search modes and result labels (decision #10)

**Hard constraint:** branded food retrieval (`searchFoods` Phase A–C over `food_objects`,
`determineSectionKey`, scoring, OFF fallback gates) is **not modified**. New modes are **parallel
retrieval paths** appended to the response — exactly how `promoted_off` / `off` were added.

| Mode | What it queries | Result label / section | Source |
|---|---|---|---|
| **All** | union of below, in trust order | existing sections + new sections appended | merged |
| **Foods** | `searchFoods` (unchanged) | My Foods / Common / Branded / Scanned / Other / Reviewed Community / Open Food Facts | `food_objects` (+OFF) |
| **Meals** | `MealDocument` where `kind='meal'`, person-scoped | "Meals" | new doc store |
| **Recipes** | `MealDocument` where `kind='recipe'` | "Recipes" | new doc store |
| **Restaurants** | `imported_menus` / eat-out items | "Restaurants" | menus |
| **History/Recent** | `GET /api/journal/history` + `repeat` | "Recent" | journal_entries |

Implementation pattern:
- Extend `SectionKey` union with `'meals' | 'recipes' | 'restaurants' | 'recent'` (additive).
- Add `SECTION_CONFIG` labels + `SECTION_ORDER` positions (after food sections).
- Add parallel retrieval functions; append their sections in the response build step **after** the
  existing food sections — never inside `determineSectionKey`.
- Add a `mode` query param to `/api/foods/search` (default `all`). `mode=foods` ⇒ byte-for-byte
  identical to today's response (regression anchor for QA).

---

## 8. Data-flow diagrams

### 8.1 Today (problem state)

```
Saved Meal ─apply─► [N flat journal_entries]          (ingredient pile — decision #5 broken)
Planned Meal ─execute─► [1 journal_entry from totals]  (grouped but items lost)
Single food ─log─► [1 journal_entry]                   (fine)
Import ─save─► journal_meal_templates                  (no yield gate — decision #4 partial)
```

### 8.2 Target

```
Capture (URL/text/photo/label/menu/barcode/manual)
        └─► imported_meals (draft, parse_status)
              └─► REVIEW + CONFIRM YIELD ─► MealDocument (Meal Library)  [recipe|meal]
                      ├─► add to plan ─► planned_meals (PlannedMealInstancePayload, planned_servings)
                      │                     └─► execute ─► journal_entries.payload.meal_group (grouped, components kept)
                      └─► log now ──────────────────────► journal_entries.payload.meal_group (grouped, components kept)

Single food ─log─► journal_entries (flat, no meal_group)   (unchanged)
Branded search ─► searchFoods (unchanged) + appended Meals/Recipes/Restaurants/Recent sections
```

---

## 9. Implementation packet sequence

Ordered so each packet is shippable and non-destructive. **None** of packets 1–3 touch the live log UI behavior.

| # | Packet | Outcome |
|---|---|---|
| **P1** | **Canonical types + adapters (contract only)** | Add `MealComponent`, `MealDocument`, `PlannedMealInstancePayload`, `LoggedMealGroup`, `CanonicalMacros`, `NutritionBasis` to a new `lib/meal/types.ts`. Add pure adapter functions mapping each legacy shape → canonical and back. **No DB, no behavior change.** Unit tests prove round-trip + no-loss. |
| **P2** | **Schema codification + `meal_group` JSONB** | Check in the missing `imported_meals` Phase-4 migration (codify live schema). Add `journal_entries.payload.meal_group` as versioned JSONB (no column changes; validator extension). Add `meal_documents` table (JSONB `document_json`, `schema_version`, `kind`, `status`) — versioned-JSONB-first. |
| **P3** | **Deterministic recompute service** | Centralize recompute (`lib/meal/recompute.ts`) wrapping `convert.ts` + `mealDerived.ts` + grounding. Implement §5 policy + confidence. Pure/deterministic; fully unit-tested. No AI. |
| **P4** | **Import pipeline → MealDocument + confirm-yield** | Add yield-confirm gate; `save` writes a `MealDocument` (status `confirmed`). Photo/label/screenshot capture adapters feed the same `import-recipe` path. |
| **P5** | **Grouped logging write path** | Apply Saved Meal and Execute Planned Meal both write **one** grouped entry (`meal_group`) instead of exploding/flattening. Single-food logging unchanged. (Log-page *rendering* redesign still deferred.) |
| **P6** | **Search modes** | Add Meals/Recipes/Restaurants/Recent parallel sections + `mode` param. Branded search untouched. |
| **P7** (deferred) | Leftovers / prepared-batch + log-page grouped rendering redesign | Out of scope for foundation. |

---

## 10. Files likely to change per packet

**P1 — Canonical types + adapters**
- NEW `lib/meal/types.ts`, `lib/meal/adapters.ts`, `lib/meal/__tests__/adapters.test.ts`
- Read-only references: `lib/journal/types.ts`, `lib/plans/types.ts`, `lib/food/types.ts` (no edits)

**P2 — Schema codification + JSONB**
- NEW `scripts/sql/codifyImportedMealsPhase4.sql` (idempotent, matches live)
- NEW `scripts/sql/createMealDocuments.sql`
- EDIT `lib/journal/payloadValidators.ts` (allow `meal_group` in intake schema)
- EDIT `lib/journal/types.ts` (add `meal_group?` to `IntakePayload`)

**P3 — Recompute service**
- NEW `lib/meal/recompute.ts`, `lib/meal/__tests__/recompute.test.ts`
- Read-only: `lib/units/convert.ts`, `lib/nds/mealDerived.ts`, `lib/plans/ingredientMatcher.ts`, `lib/plans/ndsConfidence.ts`

**P4 — Import → MealDocument**
- EDIT `lib/plans/importsServerService.ts` (`promoteImportedMealToTemplate` → `promoteImportedMealToDocument` + yield gate)
- EDIT `pages/api/journal/plans/imports/meals/[id]/save.ts`
- EDIT `pages/journal/plans/imports/[id].tsx` (confirm-yield UI)
- NEW capture adapters: `lib/plans/capture/photoCaptureAdapter.ts`, `labelCaptureAdapter.ts` (+ reuse `lib/plans/onscreenText/*`)
- EDIT `pages/api/journal/plans/ai/import-recipe.ts` (accept photo/label source)
- NEW `lib/meal/mealDocumentServerService.ts`, `pages/api/journal/meals/documents/*`

**P5 — Grouped logging**
- EDIT `pages/journal/log.tsx` (`handleApplySavedMeal` → single grouped write)
- EDIT `lib/plans/planServerService.ts` (`executePlannedMeal` → write `meal_group` with components)
- EDIT `lib/journal/journalServerService.ts` (`createEntry` NDS path reads `meal_group.totals` when present)
- EDIT `lib/nds/mealDerived.ts` (accept grouped components when present — additive)

**P6 — Search modes**
- EDIT `lib/food/types.ts` (`SectionKey` union, `mode`)
- EDIT `lib/food/foodServerService.ts` (`SECTION_CONFIG`, `SECTION_ORDER`, append parallel sections; **do not touch** `determineSectionKey` / Phase A–C)
- EDIT `pages/api/foods/search.ts` (`VALID_SECTIONS`, `mode` param)
- NEW `lib/meal/mealSearch.ts`, `lib/meal/restaurantSearch.ts`
- EDIT `pages/journal/log.tsx` (mode tabs; render new sections)

---

## 11. Required migrations (versioned-JSONB-first)

| Need | Approach | Destructive? |
|---|---|---|
| `imported_meals` Phase-4 columns | **Codify** existing live schema in an idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` script. | No |
| Grouped logged meals | **JSONB extension** of `journal_entries.payload.meal_group`. No column change. | No |
| Meal Library documents | New `meal_documents` table with `document_json JSONB` + `schema_version`, `kind`, `status`, person FK, RLS. Prefer JSONB over fully-normalized columns for V1. | No (additive) |
| Saved meals → documents | Keep `journal_meal_templates`; adapter-map to `MealDocument` at read time. Optional later backfill. Product is pre-launch (#11) so a one-time backfill is acceptable but not required first. | No |
| Search modes | None (read-only retrieval). | No |

No table is dropped or rewritten. All new structure is additive JSONB or new tables.

---

## 12. QA checks

### 12.1 Grouped meal logging
- Applying a saved meal creates **exactly one** `journal_entries` row with `payload.meal_group.components.length === N` (not N rows).
- Executing a planned meal creates one grouped entry whose `meal_group.components` match the planned components (no item loss) and whose `totals` equal the previous `payload.totals`.
- Day view (`pages/journal.tsx`) and `LoggedItemCard` render a grouped entry without errors (read `name`/`calories`/`macros`).
- Daily NDS for a day with grouped meals equals NDS computed from the same foods logged flat (parity test).
- Editing one logged meal instance sets `detached_from_source=true` and does **not** mutate the source `MealDocument`.
- Deleting a grouped entry removes one row and decrements day totals correctly.

### 12.2 Branded food search preservation
- `GET /api/foods/search?q=...&mode=foods` response is **byte-identical** to current `GET /api/foods/search?q=...` (golden-file regression over a fixed query set).
- Section order, labels, scores, OFF fallback gate reasons, and same-item suppression unchanged for `mode=foods`.
- UPC scan → `lookupByUpc` returns identical results; provisional items still land in `scanned` section.
- Adding Meals/Recipes/Restaurants/Recent sections never reorders or removes any food section in `mode=all`.
- `determineSectionKey` and Phase A–C retrieval have **zero diff** in P6.

### 12.3 Recompute / no-AI
- Recompute of a fully-grounded meal is deterministic and stable across runs (same inputs → same outputs).
- A meal with any `match_status ∈ {guessed, none}` component is flagged `needs_review` and its ungrounded components are **not** assigned invented numbers.
- No new code path calls the AI gateway for nutrition arithmetic (grep guard in CI: AI runs limited to `*_parse`/`*_normalize`/`*_extract`/`*_translate` run types).

---

## 13. First implementation packet — Cursor prompt (P1)

> Paste this as the next packet prompt. It is contract-only and safe.

```
Fine Diet Meal Object Foundation — Packet 1: Canonical Meal Types + Adapters (contract only)

Scope: Add the canonical meal contract and pure adapters. NO database changes, NO API changes,
NO UI changes, NO behavior changes. This packet only adds new files + tests.

Source of truth: docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md (§3 canonical types, §2 conflicts).

Do:
1. Create lib/meal/types.ts exporting exactly the canonical types from the audit §3:
   - NutritionBasis, CanonicalMacros, MealComponent
   - MealDocumentKind, MealDocumentStatus, MealYield, MealDocument
   - PlannedMealInstancePayload
   - LoggedMealGroup, GroupedMealEntryPayload
   Reuse MealNDSShape / NDSVersionStamp from lib/plans/types.ts and NutritionEstimateConfidence
   from lib/plans/types.ts; import, do not redefine.

2. Create lib/meal/adapters.ts with PURE functions (no I/O, no DB):
   - intakePayloadToComponent / componentToIntakePayload
   - mealTemplateItemToComponent / componentToMealTemplateItem
   - importedDraftIngredientToComponent (+ ingredientMatchEntryToComponent merge)
   - eatOutAttachableItemToComponent / componentToEatOutAttachableItem
   - plannedMealPayloadToInstance / instanceToPlannedMealPayload
   Normalize macros to CanonicalMacros (_g keys) and food links to food_object_id (snake_case).
   Set nutrition_basis explicitly for each source. Default needs_review/match_status sanely
   for legacy rows (no data loss).

3. Create lib/meal/__tests__/adapters.test.ts proving:
   - round-trip for each adapter pair preserves name, quantity, unit, calories, macros, food link.
   - macros key drift (protein vs protein_g) is reconciled both directions.
   - legacy rows without grounding fields default to match_status='none', needs_review=false for
     user-entered foods and true for guessed.

Do NOT:
- Modify lib/journal/*, lib/plans/*, lib/food/*, any pages/api/*, any components/*, or any SQL.
- Add AI calls. Add network calls. Add Supabase calls.
- Change journal_entries, journal_meal_templates, planned_meals, imported_meals behavior.

Acceptance:
- `npx tsc --noEmit` passes.
- `npx jest lib/meal` passes.
- No diff outside lib/meal/.
```

---

## 14. Open questions to confirm against the Strategy Packet

1. **Meal Library home:** confirm Meal Library reads `MealDocument` (recipe+meal unified) rather than `journal_meal_templates`. Audit recommends unified; decision #12 says "treat Meal Library as the likely home."
2. **Saved meals migration timing:** since pre-launch (#11), do we backfill `journal_meal_templates` → `MealDocument` in P4, or run adapter-only and backfill later? Audit defaults to adapter-only first.
3. **Nutrition label → food_object promotion:** should confirmed labels create user `food_objects` (reusable, searchable) or stay meal-local components? Audit suggests optional promotion.
4. **`mode=all` ordering:** confirm new sections (Meals/Recipes/Restaurants/Recent) sort *after* all food sections, or interleave Recent near top. Audit places them after to protect food-search regression.
```

