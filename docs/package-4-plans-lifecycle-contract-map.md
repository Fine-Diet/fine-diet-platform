# Package 4 — Plans Lifecycle & Ownership Contract Map

## Frozen ownership

| Domain | Owns | Does not own |
|---|---|---|
| **Plans** | Intention, dates, slots, scheduling, plan lifecycle (`draft` / `active` / `archived`), current-plan selection, planned servings / schedule fields | Meal/recipe identity, prep, nutrition source of truth |
| **MealDocuments (Package 3)** | Reusable meal/recipe identity, components, provenance, yield, nutrition status | Plan activation, uniqueness of current plan |
| **Log** | Observed execution truth | Future intention |
| **Home** | Read layer over current plan | Inventing plan state |
| **Pantry / Grocery** | Later readiness / acquisition | Out of Package 4 scope |

## Canonical lifecycle states

| Status | Meaning | Becomes current? |
|---|---|---|
| `draft` | Generated or manual plan not yet activated; children may still be writing | **No** |
| `active` | Eligible current plan | Yes (via `selectCurrentPlan`) |
| `archived` | Retired historical plan; kept for referenced reads | **No** |

### Required fields (contract)

- `person_id` — ownership / person scope (every write)
- `title` — non-stub preferred; generated plans use dated fallback when gateway returns stub
- `start_date` / `end_date` — valid range; week shape defaults end = start + 6 when absent
- `plan_shape` — `day` \| `week` \| `multi_day`
- `status` — as above
- `created_at` / `updated_at` — timestamps; selection tie-break uses `created_at`, then `start_date`, then `id`

## Current-plan selection

Centralized in `lib/plans/currentPlan.ts`:

- **Zero active** → `null` (never fall back to draft/archived history)
- **One active** → that plan
- **Multiple active** → integrity conflict; deterministic winner for read continuity; `resolveCurrentPlan` exposes `conflictPlanIds`

All app surfaces must use `selectCurrentPlan` / `resolveCurrentPlan` — not ad-hoc `find(active) ?? plans[0]`.

## Generation / activation

1. Insert plan as `draft`
2. Persist `plan_days` / `plan_slots` / `planned_meals`
3. Activate only after children are durable via `activate_generated_plan` RPC (preferred) or activate-first compensating fallback
4. Incomplete drafts are discarded; already-active plans are never deleted by cleanup
5. Prior actives are archived (not deleted) only after the new plan is active (RPC transaction / fallback order)

## MealDocument consumption

New library attachments stamp on `planned_meals.payload`:

- `source_meal_document_id`
- `planned_servings`
- `meal_document_snapshot: true` (payload structure is resilience, not library truth)

Archived MealDocuments: existing plan pointers remain readable; **new** attachments are rejected server-side.

Nutrition unknowns stay unknown; serving scaling reuses Package 3 helpers.

## Legacy compatibility

- Manual create API still inserts `draft` (unchanged)
- Rows with multiple actives are tolerated and surfaced as integrity conflicts — not silently coerced
- Pointer lives in payload JSON (no new first-class column in this packet)
- `activate_generated_plan` SQL is reviewed artifact only — **not** applied to production from this packet

## Key modules

| Concern | Path |
|---|---|
| Current-plan resolver | `lib/plans/currentPlan.ts` |
| Persist + activate | `lib/plans/planServerService.ts` (`persistAiPlan`, `activateGeneratedPlan`) |
| MealDocument attach gate | `lib/plans/mealDocumentPlanAttach.ts` |
| Pointer stamp (client-safe) | `lib/plans/mealDocumentPlanPointer.ts` |
| Activation RPC proposal | `scripts/sql/addActivateGeneratedPlan.sql` |
