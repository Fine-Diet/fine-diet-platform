# Plans Reusable Authoring v1 — Implementation Note

Base: `main` @ `ecbba17` (Plans Authoring Convergence merge).

## Reused APIs and components

| Area | Reuse |
|------|--------|
| Persistence | `reusable_plan_day_templates`, `reusable_plan_week_patterns` via `reusablePlanningStore.ts` |
| Apply semantics | `instantiatePlanDayTemplate`, `instantiatePlanWeekPattern` (append-only, populated-day confirmation) |
| Slot matching | `matchReusableSlotToTarget` unchanged |
| Meal editing | Shared `MealComposer` via `TemplateMealComposerPanel` + `templateMealToMealDocument` adapter |
| Provenance | Existing `reusable_provenance` stamping on instantiate; template edits do not mutate dated plans |

## Gaps closed in this branch

- CRUD store/service/API for get, update, delete, duplicate (no schema migration)
- Blank day-template create from profile meal schedule slots
- Structure-only save via `include_meals: false` on template POST
- Dedicated routes: `/app/plans/day-templates`, `/app/plans/week-patterns`
- Plans drawer entries; removed Meal Schedule drawer item
- Copy cleanup: Plans home “Reusable Planning”, Weekly CC “Plans overview”

## Pause conditions — not triggered

- No database schema changes
- No parallel meal/component model (composer adapters only)
- Delete removes snapshot rows only; provenance on already-applied meals remains historical
- Canonical `/app/plans/*` routes follow existing app-shell re-export pattern

## Manual QA path

1. Drawer → Day Templates → create blank → add/edit meals with composer → rename → apply to populated day (confirm append)
2. Duplicate + delete template
3. Drawer → Week Patterns → create from selected plan days → edit day meals → apply with populated-span confirm
4. Verify drawer has no Meal Schedule / Meal Map entries
