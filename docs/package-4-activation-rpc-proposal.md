# Package 4 — Activation RPC / Migration Proposal & Rollback

## Status

**Reviewed artifact only.** Do **not** apply to production from this packet.

Source of truth: `scripts/sql/addActivateGeneratedPlan.sql`

## Contract

`activate_generated_plan(p_person_id uuid, p_plan_id uuid) → jsonb`

Within one transaction + advisory xact lock per person:

1. Lock `plans` row for `(person_id, plan_id)`
2. Reject missing / non-activatable / no-days plans
3. **Promote target to `active` first**
4. Archive other actives for that person
5. Return `{ plan_id, archived_count }`

Idempotent enough for safe retry: re-activating an already-active plan with children succeeds and re-archives peers.

Granted to `service_role` only.

## Application fallback (RPC absent)

Implemented in `activateGeneratedPlanWithCompensation`:

1. Validate person scope, activatable status, durable days
2. Activate generated plan first
3. Best-effort archive prior actives (failures log; leave multi-active integrity conflict rather than retire into zero-active)
4. Never archive/retire a valid current plan before the new plan is confirmed active
5. On child-write failure before activation: discard incomplete **draft** only

## Rollback

```sql
DROP FUNCTION IF EXISTS public.activate_generated_plan(UUID, UUID);
```

After rollback, application continues via compensating fallback. No data backfill required for rollback of the function itself.

## Related Package 4 SQL artifact

Slot identity unique index proposal (reviewed, not applied from this packet):

`scripts/sql/addPlanSlotOrdinalUniqueIndex.sql`

Compatible with `idx_plan_slots_day_ordinal_unique` from the horizon-extension SQL if already present.

## Out of scope / holds

- No production DDL application from this packet
- No backfill, cleanup, or production data mutation
- Unique partial index on sole-active-per-person can be considered in a later approved migration once RPC is live
