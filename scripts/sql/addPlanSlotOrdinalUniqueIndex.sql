-- ============================================================================
-- Package 4 — unique slot identity within a plan_day
--
-- Enforces: no duplicate (plan_day_id, slot_ordinal) rows in plan_slots.
--
-- Compatibility note:
--   scripts/sql/addAtomicPlanHorizonExtension.sql already defines
--   idx_plan_slots_day_ordinal_unique with the same predicate. This file is
--   the Package 4 reviewed artifact for lifecycle integrity; use IF NOT EXISTS
--   so re-application is safe if the horizon migration is already live.
--
-- DO NOT apply this to production from the review packet. Ship only when
-- approved as a managed migration after preflight.
--
-- Preflight (read-only):
--   -- 1) Does the unique index already exist?
--   SELECT indexname
--   FROM pg_indexes
--   WHERE schemaname = 'public'
--     AND indexname = 'idx_plan_slots_day_ordinal_unique';
--
--   -- 2) Are there existing duplicate ordinals that would block creation?
--   SELECT plan_day_id, slot_ordinal, count(*) AS n
--   FROM public.plan_slots
--   GROUP BY plan_day_id, slot_ordinal
--   HAVING count(*) > 1;
--
-- If duplicates exist, resolve them in a separate reviewed cleanup packet
-- before creating the unique index. Do not apply destructive cleanup here.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_plan_slots_day_ordinal_unique;
--   -- Note: dropping may also remove the horizon-extension dependency on this
--   -- index. Prefer leaving the index in place once applied.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_plan_slots_day_ordinal_unique
  ON public.plan_slots (plan_day_id, slot_ordinal);

COMMENT ON INDEX public.idx_plan_slots_day_ordinal_unique IS
  'Package 4 / horizon extension: unique slot_ordinal identity within a plan_day.';
