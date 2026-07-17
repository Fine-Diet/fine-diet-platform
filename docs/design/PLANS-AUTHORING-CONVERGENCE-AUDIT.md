# Plans Authoring Convergence — Audit / Write-Path Matrix (Phase 1)

**Status:** Audit packet. No behavior changes in this document. Gate 1 of the
Fine Diet Plans Authoring Convergence execution packet (doc `e742593a-3d7c-423b-9221-2d697df56f5a`).
**Goal:** Ground the six product asks (shared Meal Composer, Plans integration,
editable Day Templates, editable Week Patterns, explicit reorder controls,
progressive grocery readiness) against the live codebase before any UI work,
and flag what can be extracted directly, what needs a compatibility wrapper,
and what must remain separate.

---

## 0. TL;DR

The canonical meal foundation described in `docs/design/MEAL-OBJECT-FOUNDATION-AUDIT.md`
is **already built** (`lib/meals/*`, `meal_documents` table, `LoggedMealGroup`,
deterministic recompute). This packet is not a foundation packet — it is an
**authoring-surface** packet on top of a mostly-solid foundation. Concretely:

1. **There is no shared "Meal Composer" component today.** The closest reusable
   multi-component editors are `EditMealDocumentPanel` (persists a `MealDocument`)
   and `PlannedMealAdjustComposer` (ephemeral pre-log adjustment). `pages/journal/log.tsx`
   itself is a search/library/capture **add-to-log** surface, not a staged builder.
2. **Two parallel "saved meal" systems exist and are not unified:** legacy
   `journal_meal_templates` (used by `/journal/meals/*` + `AddItemsPanel`) and
   canonical `meal_documents` / `MealDocument` (used by `/app/meals` +
   `EditMealDocumentPanel`). Any shared composer's "Save as Meal" action must
   pick one target — recommendation is `MealDocument`, with the legacy template
   path reached only via existing adapters (`mealTemplateItemToComponent`), not a
   rewrite. See §7.1.
3. **Grouped meal logging is implemented four times in parallel**, not once:
   `groupedMealLoggingService` (log a `MealDocument`), `AddToLogPanel` client
   adapters (log a search result), `plannedMealExecutionPayload` (execute a
   planned meal), and legacy `handleApplySavedMeal` (still explodes a template
   into N flat rows — does not group at all). See §4.4.
4. **Plans' `SlotEditor` is explicitly "minimal" today** — template/import
   attach + manual name/type/totals, not a component-level composer. Phase 3
   (Plans integration) is close to fully additive, not a rewrite. See §3.4.
5. **Day Templates and Week Patterns have zero create/edit-from-scratch surface
   today.** Storage and service layers only support snapshot-save (`insert`),
   `list`, and `instantiate` (append). There is no `get-by-id`, `update`, or
   `delete` anywhere in the stack. Phases 4 and 5 are genuinely new surface,
   not a retrofit. See §5.
6. **Grocery already separates required-ingredient truth, chosen shopping
   product, and retailer/price truth into three different tables**, exactly as
   the packet's product rules require. Per-ingredient *grounding* readiness
   (matched/partial/guessed/none) already lives on `MealComponent` and is
   usable at composer time, before a plan or grocery list exists. Per-ingredient
   *pricing* readiness only exists after grocery generation, via a separate
   read model. These are two different moments and must not be conflated. See §6.
7. **"Adjust & Log" already exists end-to-end** (`PlannedMealContextCard` →
   `PlannedMealAdjustComposer` → `executePlannedMeal(..., 'log_adjusted', ...)`),
   contradicting the packet's implicit assumption that it needs to be built new.
   The work here is threading the *shared* composer into that existing flow, not
   creating the flow. See §3.5.
8. **Terminology reconciliation:** the packet brief and the prior foundation
   audit both say "MealDocumentStatus" — the live field is `MealReviewState`
   (`'draft' | 'needs_review' | 'confirmed'`) on `lib/meals/types.ts`. Use that
   name in all forthcoming packets.

None of the above requires touching `lib/journal/*` core logging, `lib/plans/*`
execution/idempotency, or `lib/plans/groceryServerService.ts` derivation. The
gaps are additive: a new shared composer component/service boundary, new
Day/Week template CRUD + editor UI, and explicit reorder controls layered onto
existing data.

---

## 1. Log meal builder — current shape

### 1.1 Modes

`pages/journal/log.tsx` composes two independent mode concepts:

- **Log Builder mode** (`LogMode = 'search' | 'library' | 'capture'`,
  `components/journal/log/AddToLogPanel.tsx:56, 535-539`): search, browse
  library, or capture (import recipe; barcode scan is a "Coming soon"
  placeholder inside Capture — the *real* UPC path is separate, see below).
- **Entry-type tabs** (`EntryTab`, `log.tsx:86, 222, 357-368`): food/water/sleep/etc,
  orthogonal to Log Builder mode.

Real UPC/barcode flow: `BarcodeScanner` → `handleBarcodeScan` (`log.tsx:1025-1051`)
→ `handleLogFood`, independent of the Capture tab's placeholder.

### 1.2 Core write handlers (immediate-log, not staged composition)

| Handler | `log.tsx` | Behavior |
|---|---|---|
| `handleLogFood` | 693-753 | Single food, immediate |
| `handleLogFromHistory` | 756+ | Re-log history/recent |
| `handleLogMealResult` | 799-819 | One grouped meal from a `MealDocument` search result |
| `handleApplySavedMeal` | 875-899 | **Explodes** a `journal_meal_templates` template into N flat intake rows — does not group |
| `handleBarcodeScan` | 1025-1051 | UPC → `handleLogFood` |

There is **no in-page "build a multi-component meal, then save" composer** on
`log.tsx`. The page logs immediately per action. Post-log editing of an
already-grouped entry goes through `EditLoggedMealGroupPanel` (name/servings/note
only — no component list).

### 1.3 Existing composer-shaped components (candidates for extraction)

| Component | Path | Persists to | Component-level editing? |
|---|---|---|---|
| `EditMealDocumentPanel` | `components/meals/EditMealDocumentPanel.tsx` | `MealDocument` (PATCH) | Yes — add/remove, food match, steps |
| `PlannedMealAdjustComposer` | `components/journal/log/PlannedMealAdjustComposer.tsx` | Ephemeral (feeds `execute log_adjusted`) | Yes — in-memory `MealDocument` snapshot |
| `AddItemsPanel` | `components/journal/AddItemsPanel.tsx` | `journal_meal_templates` (legacy) | Add/remove/qty only, different model (`MealTemplateItem`) |
| `LogMealDocumentPanel` | `components/meals/LogMealDocumentPanel.tsx` | Journal (log only) | No — date/time/servings/note only |
| `EditLoggedMealGroupPanel` | `components/journal/EditLoggedMealGroupPanel.tsx` | Journal (instance edit) | No — name/servings/note only |

**Extraction verdict:** `EditMealDocumentPanel` and `PlannedMealAdjustComposer`
are the two closest analogs to the packet's "shared Meal Composer." Neither is
currently shared with `log.tsx`'s add-flow or with `AddItemsPanel`'s legacy
template flow. A shared composer should generalize the *pattern* both already
use (components array + food-match + qty/unit/prep-note + steps), not bolt
onto either directly.

### 1.4 Reorder / duplicate controls (repo-wide check)

**No move-up, move-down, swap, duplicate, or drag-and-drop exists in any meal
composition UI today** — not in `EditMealDocumentPanel`, not in
`PlannedMealAdjustComposer`, not in `meals/edit/[id].tsx` + `AddItemsPanel`.
All of them support only add/remove. (Move/duplicate/reorder patterns exist
elsewhere in the app — e.g. admin question-set composition — but are unrelated
UI.) This confirms Phase 2/4/5's explicit move-up/down/swap/duplicate controls
are wholly new UI, not a swap-in of an existing pattern; no drag-and-drop
library needs to be removed since none is present.

### 1.5 Context-mode concepts

No existing `'create' | 'edit-saved' | 'plan' | 'log' | 'adjust-and-log'` enum
exists anywhere in the meal-composition code. The closest analog is
`LogMode` (search/library/capture) plus the ad hoc `PLANNED_MEAL_LOG_MODE = 'planned'`
query-param mode used to drive `PlannedMealContextCard`
(`lib/plans/plannedMealLogRoute.ts:12-72`). The packet's suggested context modes
would be new.

---

## 2. Saved MealDocument create/edit surfaces

### 2.1 Canonical types (`lib/meals/types.ts`)

`MealComponent` (110-146) carries `food_object_id`, `match_status`
(`'matched'|'partial'|'guessed'|'none'`, 80), `source_kind`, `needs_review`,
`macros: CanonicalMacros` (46-52), `nutrition_basis`. `MealDocument` (250-302)
carries `kind` (`'recipe'|'meal'`, 153), `review_state: MealReviewState`
(`'draft'|'needs_review'|'confirmed'`, 160 — **not** `MealDocumentStatus`),
`components[]`, `yield`, `per_serving`/`totals`, `source`, `nds`.

### 2.2 Service surface

`lib/meals/mealDocumentServerService.ts`: `createMealDocumentForPerson`,
`getMealDocumentForPerson`, `listMealDocumentsForPerson`,
`findMealDocumentBySourceImportedMeal`, `updateMealDocumentForPerson`.
**No delete.**

`lib/meals/mealDocumentEditService.ts`: `parseMealDocumentEditPatch` →
`buildEditedMealDocument` (pure, deterministic recompute) →
`applyMealDocumentEditForPerson` (load → resolve foods → build → persist).
Edit surface: title/description/prep_notes/serving_label/recipe_yield_servings/
review_state/components (incl. `add_components`, `remove_component_ids`,
`unmatch_component_ids`)/steps. **Never touches journal_entries.**

### 2.3 Storage

`meal_documents` table (`scripts/sql/createMealDocuments.sql:33-69`):
`document_json JSONB` is the source of truth; `kind`, `title`, `review_state`,
`intents`, `source_type/id/url` are denormalized filter/list projections only.
No NDS columns — NDS lives inside the JSON when present.

### 2.4 API routes

| Route | Method | Service |
|---|---|---|
| `/api/journal/meals/documents/search` | GET | `searchMealDocumentsForPerson` |
| `/api/journal/meals/documents/[id]` | GET / PATCH | `getMealDocumentForPerson` / `applyMealDocumentEditForPerson` |
| `/api/journal/meals/documents/[id]/log` | POST | `logMealDocumentForPerson` |
| `/api/journal/meals/documents/from-import/[id]` | POST | `saveImportedMealAsMealDocumentDraft` / `confirmImportedMealYieldAndSave` |

No DELETE route for `MealDocument` exists.

### 2.5 UI — and the legacy-parallel finding

**Canonical:** `pages/app/meals.tsx` (Meal Library) + `EditMealDocumentPanel` +
`MealComponentFoodSearch` (grounding search) + `LogMealDocumentPanel`. There is
**no hand-built "create MealDocument from scratch" page** — creates today are
import-driven only (`from-import/[id]`) or backfill scripts.

**Legacy and still separate:** `pages/journal/meals/create.tsx` (builds a
`journal_meal_templates` row from checked *already-logged* journal entries —
not component composition), `pages/journal/meals/edit/[id].tsx` (edits
`MealTemplate` via `AddItemsPanel`), `pages/journal/meals/index.tsx` (list/delete
templates). **This is a second, un-unified "saved meal" system.** `log.tsx`
links to the legacy pages (`log.tsx:1719, 1729, 1961`), not to Meal Library.

### 2.6 Component grounding / resolution status

`lib/meals/componentGrounding.ts`: `applyGrounding*` sets
`match_status='matched'`, `source_kind='food_object'`, copies nutrition, clears
`needs_review`. `detachComponentGrounding` sets `match_status='none'`,
`source_kind='user_entered'`, `needs_review=true`. Import review UI
(`pages/journal/plans/imports/[id].tsx:1032-1049`) is the only place all four
`match_status` values are shown distinctly today; `pages/app/meals.tsx` and
`EditMealDocumentPanel` only distinguish "Needs review" vs "Unmatched," not the
full four-state spectrum.

---

## 3. Planned-meal create/edit and Adjust & Log

### 3.1 Types

`PlannedMeal` (`lib/plans/types.ts:214-266`) carries `execution_state`
(`'pending'|'eaten'|'skipped'`), `journal_entry_id`, `source_template_id`,
`source_imported_meal_id`, `reusable_provenance`, and `MealNDSShape` fields.
`PlannedMealPayload` is Zod-validated (`PlannedMealPayloadSchema`,
`lib/plans/validators.ts:107-117`): `items[]` + `totals` + optional `notes_md`.

### 3.2 Service surface (`lib/plans/planServerService.ts`)

| Function | Lines | Touches journal? | Touches planned payload? |
|---|---|---|---|
| `insertPlannedMeal` | 635-661 | No | Creates |
| `updatePlannedMeal` | 663-701 | No | Patches (pending only, enforced at API layer) |
| `movePlannedMeal` | 737-801 | No | Pending only |
| `copyPlannedMeal` | 810-871 | No | New pending row |
| `executePlannedMeal` | 1343-1444 | Yes (`eat`/`log_adjusted`/`undo`) | **Never** (explicit design comment, 1241-1246) |

`executePlannedMeal(personId, mealId, action, occurred_at?, intake_payload?)`
with `action ∈ {'eat','skip','undo','log_adjusted'}`. `eat` builds an exact
grouped payload via `buildExactPlannedMealIntakePayload`; `log_adjusted`
requires a caller-supplied `intake_payload`, forces
`meal_group.detached_from_source=true`, and is the mechanism behind "Adjust &
Log." Idempotent via CAS on `execution_state='pending' AND journal_entry_id IS NULL`.

### 3.3 API routes (`pages/api/journal/plans/meals/**`)

`POST /meals`, `GET|PATCH|DELETE /meals/[mealId]` (PATCH/DELETE gated to
`execution_state==='pending'`), `POST /meals/[mealId]/execute` (body:
`{action, occurred_at?, intake_payload?}`), `POST /meals/[mealId]/copy`,
`POST /meals/[mealId]/move`. **No route contains "adjust"** — adjust is a
value of `action`, not a separate endpoint.

### 3.4 Plans UI today

`components/journal/plans/SlotEditor.tsx` is explicitly scoped as minimal
(comment, lines 6-22): template/import picker with servings scale, or a manual
name/type/**totals-only** form. **No per-item editing, no food_object attach,
no component list** — this confirms Phase 3 ("Plans integration") adds a real
composer where today there is only attachment + totals entry. Low regression
risk: nothing existing is being replaced, only supplemented.

### 3.5 Adjust & Log already exists end-to-end

Contrary to a naive reading of the packet, this is **not missing**:

1. `SlotCard` "Adjust & log" CTA → `handleAdjustLog` deep-links to Log
   (`pages/journal/plans/day/[date].tsx:535-554`) via
   `buildPlannedMealLogHref`/`mode=planned` (`lib/plans/plannedMealLogRoute.ts`).
2. `log.tsx` sets `adjustLogMode`; `PlannedMealContextCard` renders
   `PlannedMealAdjustComposer` when the planned meal is pending.
3. Composer submits via `planService.executeMeal(id, 'log_adjusted', ..., intakePayload)`.
   UI copy and code comments explicitly state the plan is never mutated.

**Implication for this packet:** the shared Meal Composer's "adjust-and-log"
context mode should *become* `PlannedMealAdjustComposer`'s internal editing UI
(reusing the shared component/food-search/nutrition machinery), not create a
new adjust flow alongside it.

### 3.6 Separation of planned intent vs actual intake

Strongly enforced today: `updatePlannedMeal` only ever writes
`planned_meals`; PATCH/DELETE on a planned meal is blocked once
`execution_state !== 'pending'` (`assertPendingForRecovery`); `undo` deletes
the linked journal entry and resets state, the one intentional exception. No
code path lets an edit-plan action write to `journal_entries`, and no code
path lets an execute/adjust action write to `planned_meals.payload`.

---

## 4. Canonical meal adapters and grouped payload builders

### 4.1 Adapters (`lib/meals/adapters.ts`) — pure, no I/O

Component-level: `intakePayloadToComponent`/`componentToIntakePayload`,
`mealTemplateItemToComponent`/`componentToMealTemplateItem`,
`eatOutAttachableItemToComponent`/`componentToEatOutAttachableItem`,
`importedDraftIngredientToComponent`, `ingredientMatchEntryToComponent`.
Document-level: `mealTemplateToMealDocument`, `importedMealToMealDocumentDraft`,
`plannedMealToMealDocument`, `eatOutPayloadToMealDocument`,
`mealDocumentToLoggedMealGroup`, `loggedMealGroupToIntakePayload`. This is the
existing "translate between legacy shape and canonical shape" layer the packet
should reuse rather than duplicate — e.g. a shared composer accepting a
saved-meal-template as a starting point can go through
`mealTemplateItemToComponent`/`mealTemplateToMealDocument` directly.

### 4.2 Grouped entry shape

`LoggedMealGroup` / `GroupedMealEntryPayload` (`lib/meals/types.ts:321-387`).
`lib/meals/loggedMealGroup.ts` provides read-only render helpers
(`buildGroupedMealView`) — it does not write.

### 4.3 `groupedMealLoggingService.ts` — the "canonical" write path

`logMealDocumentForPerson(personId, mealDocumentId, input?)` loads a
`MealDocument` by id, builds a payload, and writes **one** `journal_entries`
row via `createEntry`. **It only accepts a `mealDocumentId`, never raw
components** — any shared composer that wants to log directly (without first
persisting a `MealDocument`) cannot call this service as-is; it would need the
in-progress meal to be materialized as a `MealDocument` first (even a
throwaway/unsaved one), or a new sibling function accepting a document object
directly. This is a concrete "needs a compatibility wrapper" item for Phase 2/3.

### 4.4 Four parallel triggers for grouped logging (the core inconsistency)

| Trigger | Path | Uses `groupedMealLoggingService`? |
|---|---|---|
| Log a `MealDocument` from Meal Library | `POST .../documents/[id]/log` | **Yes** |
| Log a search/library result on `log.tsx` | `AddToLogPanel` client-side adapters | No — parallel client-side payload build |
| Execute a planned meal | `plannedMealExecutionPayload.ts` (`buildExactPlannedMealIntakePayload`) | No — parallel mirror using the same adapters |
| Apply a saved meal (legacy) | `handleApplySavedMeal` in `log.tsx:875-899` | No — **does not group at all**, still N flat rows |

All three grouping paths converge on the same shapes via
`lib/meals/adapters.ts`, so they are consistent in *result*, just not in
*call site*. The fourth (`handleApplySavedMeal`) is the one true regression
risk: it is the only meal-apply path that still violates "grouped first-level
entry." It is explicitly out of scope for this packet (packet doesn't ask to
fix Log's saved-meal apply), but any new Plans "Save as Meal" / "Add to Plan"
action should not accidentally route through this legacy explosion path.

### 4.5 Instance edit / detach

`loggedMealGroupInstanceEditService.ts`: safe patch surface is
`name`/`consumed_servings`/`instance_note` only (no component edits in MVP).
Any edit **always** sets `detached_from_source=true` and **never** touches the
source `MealDocument` or `planned_meals` row. This matches the packet's product
rule #4 exactly — no new work needed to satisfy it, just don't regress it.

### 4.6 Recompute policy — no AI in nutrition math (confirmed)

`lib/meals/recompute.ts` imports only `lib/units/convert.ts` primitives — no
network/AI/Supabase symbols. Trusted for recompute: `match_status ∈ {matched,
partial}` or `source_kind==='user_entered'`. Untrusted (`guessed`/`none`):
flagged `needs_review`, never silently recomputed. Confirms the packet's
"progressive resolution, not blocking" rule is already the deterministic
policy in place — a shared composer's readiness UI should read these same
states rather than invent a parallel status model.

### 4.7 Public API surface

`lib/meals/index.ts` only re-exports `types`, `adapters`, `validators`,
`storage`, `recompute`. `groupedMealLoggingService`, `loggedMealGroup`,
`loggedMealGroupInstanceEditService`, `mealDocumentServerService`,
`mealDocumentEditService`, `importToMealDocumentService`,
`mealDocumentSearchService`, `componentGrounding` are **not** in the barrel and
must be imported by direct path. A shared composer service module should
follow this same convention (direct import, not barrel) to avoid widening the
public surface unintentionally.

---

## 5. Reusable Day Templates / Week Patterns / Meal Rhythm

### 5.1 Storage

`reusable_plan_day_templates` (`scripts/sql/createReusablePlanningTables.sql:8-30`):
`slots_json` / `unassigned_meals_json` JSONB arrays, `apply_policy` constrained
to `'append'` only, `source_plan_id/source_plan_day_id/source_date_local`
(snapshot provenance, not a live reference — comment 38-42).
`reusable_plan_week_patterns` (44-64): `days_json`, same `apply_policy`
constraint, `source_date_start/end`.

### 5.2 Service surface — snapshot-only, confirmed

`lib/plans/reusablePlanningStore.ts`: `listReusablePlanDayTemplates`,
`saveReusablePlanDayTemplate` (**insert only**), `listReusablePlanWeekPatterns`,
`saveReusablePlanWeekPattern` (**insert only**). `lib/plans/planServerService.ts`:
`savePlanDayAsTemplate` (932-991, snapshots a *dated* day),
`instantiatePlanDayTemplate` (993-1085), `savePlanWeekPattern` (1087-1133),
`instantiatePlanWeekPattern` (1135-1239).

**Confirmed gap — no get-by-id, update, or delete exists anywhere in this
stack**, service or API. This is the literal absence the packet's Phase 4/5
must fill; it is not a matter of exposing existing functions, they do not
exist.

### 5.3 API routes

`GET|POST /api/journal/plans/templates`, `POST /templates/[templateId]/instantiate`,
`GET|POST /api/journal/plans/templates/week-patterns`, `POST /week-patterns/[patternId]/instantiate`.
No PATCH/DELETE/GET-by-id routes for either resource.

### 5.4 UI — confirmed snapshot-and-apply only

`pages/journal/plans/day/[date].tsx` (706-777): name + "Save day," and a
picker to instantiate an existing template onto a target day (append only).
`pages/journal/plans/week.tsx` + `WeeklyPlanningCommandCenter.tsx` (565-646):
same pattern for week patterns. Both surfaces' own copy says "Templates append
fresh pending meals" — there is genuinely no dedicated
create-from-scratch/edit-existing template editor route or component anywhere
in `pages/journal/plans/**` or `components/journal/plans/**`. (`SlotEditor`'s
internal "templates" concept is unrelated — it means *meal* templates
(`MealTemplate`), not day/week reusable plan templates.)

### 5.5 Meal Rhythm — where it actually lives

The product concept "Meal Rhythm" is implemented as **`people.metadata.meal_schedule`**
(`MealSchedule` type, `lib/plans/types.ts:1003-1063`), not a type literally
named `MealRhythm`. Slots keyed by `MealSlotKey` (breakfast, morning_snack,
lunch, afternoon_snack, dinner, evening_snack), each with `{enabled,
target_time, label}`. Set during onboarding
(`lib/onboarding/buildProfilePatch.ts:105-128`, `defaultOnboardingFlow.ts:66-77`).
Resolved into a `schedule_snapshot` at plan-generation time via
`resolveMealSchedule`/`buildPlanScheduleSnapshot` (`lib/plans/scheduleResolver.ts:43-96, 217-276`),
which is what actually produces slot labels/times for a generated plan day.
**Any Day Template "Use my current Meal Rhythm" default should call this same
resolver**, not re-derive slot defaults independently.

### 5.6 Apply → fresh identities (confirmed)

`instantiatePlanDayTemplate`/`instantiatePlanWeekPattern` call
`insertPlannedMeal` per meal, which never supplies an `id` — the DB always
generates a new UUID. `reusable_provenance` records the *snapshot* lineage
(`kind: 'day_template'|'week_pattern'`, source ids) as metadata only; it is
not a live foreign key. This already satisfies the packet's "applying creates
fresh dated planned-meal identities" acceptance criterion structurally — the
same `insertPlannedMeal` call, unmodified, is what the new editable-template
"Apply to Date/Week" actions in Phase 4/5 should also call.

### 5.7 Reorder / swap (confirmed absent)

No reorder/swap capability exists for reusable templates or patterns at any
layer (no service function, no API route, no UI). Existing move/reorder
(`movePlannedMeal`, `/meals/[mealId]/move`) operates only on *dated* planned
meals, not on template/pattern structure. Phase 4/5's move-up/down/swap
controls are wholly new.

---

## 6. Grocery ingredient identity, resolution, retailer, price

### 6.1 Required-truth vs chosen-product vs price — already three separate tables

| Table | Role | Key fields |
|---|---|---|
| `grocery_items` | **Required ingredient truth** | `name`, `quantity`, `unit`, `food_object_id` (null = unresolved), `status` |
| `grocery_shopping_overrides` | **Chosen shopping product** | `shopping_display_name`, `purchase_quantity`/`purchase_unit`, `preferred_product` |
| `grocery_ingredient_resolutions` | Learned grounding (raw text → `food_object_id`) | `raw_name`, `unit` → `food_object_id`/`canonical_name` |
| `grocery_price_observations` | Retailer/price truth | `source` (`manual`\|`serpapi`), `retailer`, package/price fields |

`grocery_items` has **no** retailer/price/SKU columns — this separation the
packet's product rules #9/#10 ask for already exists structurally and does
not need new schema.

### 6.2 Derivation from planned meals

`generateGroceryList` (`lib/plans/groceryServerService.ts:819-990`) →
`deriveItemsFromMeals` (369-483): reads `meal.payload.items`, applies learned
resolutions when `food_object_id` is missing, aggregates, writes only
required-truth fields. Runs only over `execution_state==='pending'` meals.

### 6.3 Two different "readiness" moments — do not conflate

- **Component-grounding readiness** (pre-plan, composer-time): already exists
  on `MealComponent.match_status`/`food_object_id`/`needs_review` (§2.6, §4.6).
  Available the instant a component is added to a meal, before it is ever
  planned or turned into a grocery item.
- **Pricing readiness** (post-generation, grocery-list-time): only exists after
  `grocery_items` rows are generated, via `buildGroceryHaulSummary`
  (`lib/plans/groceryHaulSummary.ts:18-108`) checking for a current
  `grocery_price_observations` row per `match_key`. There is no DB enum for
  this; effective states are unresolved / grounded-unpriced / grounded-priced,
  computed at read time.

The packet's acceptance criterion "see ingredient product-resolution,
quantity, retailer, and price readiness" spans **both** moments. A shared Meal
Composer showing readiness *before* a plan/grocery list exists can only show
component-grounding state (§2.6) — it cannot show retailer/price state, which
literally does not exist until grocery generation runs. Phase 6's "nudges"
section already anticipates this staged disclosure (composer save summary →
plan/grocery deep-link → full grocery correction surface); the audit confirms
the data model matches that staging.

### 6.4 Existing resolution/pricing services to reuse (not duplicate)

`resolveGroceryItemIngredient`/`changeGroceryItemResolution`/`markGroceryItemUnresolved`
(`lib/plans/groceryServerService.ts`), `groceryShoppingOverrideService.ts`
(chosen-product overrides), `groceryPriceServerService.ts`
(`searchGroceryItemPrices`, `confirmSourcedGroceryPrice*`, `saveManualGroceryPrice`,
`getGroceryHaulSummaryForList` — the Stage 1 SerpAPI/haul estimator). UI:
grounded/unresolved chips + `GroceryPriceObservationBadge` on
`pages/journal/plans/grocery/[planId].tsx`. Phase 6 should deep-link into this
existing page/flow rather than rebuild resolution or price UI inside the
composer, per the packet's own instruction.

### 6.5 Governing policy doc

`docs/admin/planning-grocery-support-action-policy.md` defines Required
amount / Still to buy / Buy suggestion as authoritative truth that no support
surface may reinterpret or override. The same boundary applies to this
packet: the Meal Composer/Plans/Day-Template/Week-Pattern surfaces must read
grocery truth, never write a second copy of it.

---

## 7. Extract directly / needs a wrapper / must remain separate

### 7.1 Extract directly (reuse as-is)

- `lib/meals/adapters.ts` — all component/document adapters.
- `lib/meals/recompute.ts` — deterministic nutrition + trust policy.
- `lib/meals/componentGrounding.ts` — grounding/unmatch primitives.
- `MealComponentFoodSearch` — food-grounding search UI.
- `executePlannedMeal` (`eat`/`log_adjusted`/`skip`/`undo`) — no changes needed;
  a shared composer's "adjust-and-log" action should call this, not reimplement it.
- `insertPlannedMeal` — the fresh-identity guarantee Day/Week apply needs.
- Grocery resolution/pricing services and read models (§6.4) — deep-link, don't rebuild.
- `resolveMealSchedule`/`buildPlanScheduleSnapshot` — for Day Template "Use my current Meal Rhythm" defaults.

### 7.2 Needs a compatibility wrapper

- **`groupedMealLoggingService.logMealDocumentForPerson`** only accepts a
  persisted `mealDocumentId`. A shared composer logging directly (Plans "Add
  to Plan," Log "Log Meal" without a prior save) needs either (a) a sibling
  function accepting a `MealDocument` object directly, or (b) to always
  materialize an unsaved in-memory `MealDocument` and reuse the existing
  builder function (`buildGroupedMealIntakePayload`) without requiring the DB
  round-trip. Prefer (b) — it's a thinner wrapper and avoids a second public
  entry point.
- **Legacy `journal_meal_templates` / `AddItemsPanel` / `mealTemplateItemToComponent`**
  path: if "Save as Meal" from the shared composer must interoperate with
  existing saved-meal surfaces during a transition, wrap via
  `mealTemplateToMealDocument`/`componentToMealTemplateItem` rather than
  writing to both tables from new code.
- **Reusable planning store** (`reusablePlanningStore.ts`): needs new
  `getReusablePlanDayTemplateById`/`updateReusablePlanDayTemplate`/
  `deleteReusablePlanDayTemplate` (and week-pattern equivalents) added
  alongside the existing insert/list functions — additive, not a rewrite of
  the snapshot format.

### 7.3 Must remain separate (do not merge)

- `planned_meals.payload` vs `journal_entries.payload` — enforced today by
  `executePlannedMeal`'s "never mutate planned payload" contract (§3.6); the
  shared composer must preserve this even when it is the same UI component
  rendering both a plan-editing context and a logging context.
- `meal_documents` (canonical) vs `journal_meal_templates` (legacy) as two
  storage backends — do not merge tables in this packet; adapters already
  bridge them (§4.1).
- `grocery_items` (required truth) vs `grocery_shopping_overrides` (chosen
  product) vs `grocery_price_observations` (retailer/price) — three different
  truths, already separated; the composer only ever *reads* these, never
  writes a fourth copy.
- Component-grounding readiness (composer-time) vs grocery pricing readiness
  (post-generation) — two different lifecycle stages (§6.3); don't design one
  UI state model that pretends they're simultaneous.

---

## 8. Files likely to touch per phase (informational, not a commitment)

**Phase 2 — Shared Meal Composer**
- NEW `components/meals/MealComposer/*` (extracted from `EditMealDocumentPanel`
  + `PlannedMealAdjustComposer` patterns), NEW composer service module
  (direct-imported, not added to `lib/meals/index.ts` barrel per §4.7 convention).
- Likely wrapper addition near `groupedMealLoggingService.ts` (§7.2) — additive export, not a signature change to existing exports.
- Read-only references: `lib/meals/adapters.ts`, `recompute.ts`, `componentGrounding.ts`, `MealComponentFoodSearch.tsx` (no edits expected).

**Phase 3 — Plans integration**
- EDIT `components/journal/plans/SlotEditor.tsx` (currently minimal by design — additive composer entry point) or NEW sibling component; `pages/journal/plans/day/[date].tsx` wiring.
- Reuse `executePlannedMeal`/`insertPlannedMeal`/`updatePlannedMeal` unchanged.

**Phase 4 — Day Template editor**
- EDIT `lib/plans/reusablePlanningStore.ts` (add get/update/delete).
- EDIT `lib/plans/planServerService.ts` (add corresponding server functions alongside existing `savePlanDayAsTemplate`/`instantiatePlanDayTemplate`).
- NEW API routes: `GET|PATCH|DELETE /api/journal/plans/templates/[templateId]`.
- NEW editor page/component under `pages/journal/plans/**` / `components/journal/plans/**` — none exists today (§5.4).

**Phase 5 — Week Pattern editor**
- Same shape as Phase 4, mirrored for `reusable_plan_week_patterns` / week-patterns routes.

**Phase 6 — Grocery resolution integration**
- Likely no `lib/plans/grocery*` service edits; primarily UI: composer-side summary reading `MealComponent.match_status`, deep-links into `pages/journal/plans/grocery/[planId].tsx` for retailer/price.

---

## 9. Open questions to confirm before Phase 2 starts

1. **"Save as Meal" target:** confirm the shared composer should always write
   `MealDocument` (canonical), never `journal_meal_templates` (legacy), even
   though `log.tsx` today links users to the legacy template pages. If
   confirmed, Log's existing links to `/journal/meals/create` remain
   untouched by this packet (out of scope) while the new composer's own
   "Save as Meal" goes through the canonical path.
2. **Grouped-logging wrapper shape (§7.2):** confirm preference for wrapping
   `buildGroupedMealIntakePayload` against an in-memory `MealDocument` (no DB
   round-trip) over adding a second public function to
   `groupedMealLoggingService`.
3. **Meal Rhythm default resolution:** confirm Day Template's "Use my current
   Meal Rhythm" option should call `resolveMealSchedule` directly (server-side,
   same function plan generation uses) rather than duplicating slot-default
   logic client-side.
4. **`apply_policy` beyond `'append'`:** both reusable tables constrain
   `apply_policy` to `'append'` only at the DB level
   (`CHECK (apply_policy IN ('append'))`). If Phase 4/5's "Apply to Date/Week"
   should ever support anything other than append (e.g. replace), that is a
   schema change, not just a service addition — flag explicitly if in scope.
