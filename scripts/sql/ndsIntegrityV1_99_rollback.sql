-- ============================================================================
-- NDS Integrity v1 — Step 99: ROLLBACK
-- ============================================================================
--
-- Packet: FD-PLATFORM-NDS-01. Reverses steps 01–03 in the correct order.
--
-- LOCAL APPLICATION ONLY by the packet that produced it.
--
-- ORDERING RULE: roll back the APPLICATION FIRST, then this file. The expand
-- migrations are additive, so an application rollback alone is already safe —
-- the old code ignores the new columns, tables, and triggers. Run this file only
-- if the schema itself must be removed.
--
-- Section 3 is DESTRUCTIVE and is commented out by default. Nothing here drops a
-- journal row or an existing score.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Restore the legacy enqueue path (undo step 03)
-- ---------------------------------------------------------------------------
-- Re-run createDailyNDSTables.sql section 3 to recreate enqueue_nds_recompute()
-- and trigger_enqueue_nds_recompute. That file is idempotent for this purpose.
--
--   \i scripts/sql/createDailyNDSTables.sql
--
-- Do this BEFORE removing the new triggers below, so no window exists in which
-- neither path records a change.

-- ---------------------------------------------------------------------------
-- 2. Detach the new triggers (undo the write side of steps 01 and 02)
-- ---------------------------------------------------------------------------
-- Detaching triggers first stops new revisions and work rows from appearing
-- while the rest of the rollback proceeds.

DROP TRIGGER IF EXISTS trigger_nds_request_work ON public.journal_entries;
DROP TRIGGER IF EXISTS trigger_nds_track_journal_day_revision ON public.journal_entries;

DROP FUNCTION IF EXISTS public.nds_request_work_for_journal_change();
DROP FUNCTION IF EXISTS public.nds_track_journal_day_revision();

-- At this point the schema is inert: the new tables and columns still exist but
-- nothing writes to them. THIS IS A SAFE RESTING STATE. Stop here unless the
-- objects must actually be removed.

-- ---------------------------------------------------------------------------
-- 3. Remove the new objects (DESTRUCTIVE — uncomment deliberately)
-- ---------------------------------------------------------------------------
-- Dropping journal_day_revisions discards recorded source revisions. Any
-- daily_nds row whose source_revision then has nothing to compare against is
-- treated as invalid and recomputed, which is correct but costs a recompute
-- pass. Dropping the daily_nds columns discards persisted readings, provenance
-- and coverage, and the pre-v1 code path will report zeros again for days it
-- cannot verify.

-- DROP FUNCTION IF EXISTS public.nds_work_diagnostics();
-- DROP FUNCTION IF EXISTS public.nds_fail_work(UUID, DATE, UUID, TEXT, INTEGER);
-- DROP FUNCTION IF EXISTS public.nds_complete_work(UUID, DATE, UUID, BIGINT);
-- DROP FUNCTION IF EXISTS public.nds_claim_work(INTEGER, INTEGER);
-- DROP FUNCTION IF EXISTS public.nds_request_work(UUID, DATE, BIGINT);
-- DROP FUNCTION IF EXISTS public.nds_publish_daily_score(
--   UUID, DATE, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
--   NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, JSONB
-- );
-- DROP FUNCTION IF EXISTS public.nds_read_day_snapshot(UUID, DATE);
-- DROP FUNCTION IF EXISTS public.nds_active_generation();
-- DROP FUNCTION IF EXISTS public.nds_bump_day_revision(UUID, DATE, TEXT);
-- DROP FUNCTION IF EXISTS public.nds_consumed_day(JSONB, TIMESTAMPTZ);
-- DROP FUNCTION IF EXISTS public.nds_is_consumption_row(TEXT);

-- DROP TABLE IF EXISTS public.nds_recompute_attempts;
-- DROP TABLE IF EXISTS public.nds_recompute_work;
-- DROP TABLE IF EXISTS public.nds_computation_generation;
-- DROP TABLE IF EXISTS public.journal_day_revisions;

-- ALTER TABLE public.daily_nds
--   DROP COLUMN IF EXISTS source_revision,
--   DROP COLUMN IF EXISTS normalizer_version,
--   DROP COLUMN IF EXISTS day_policy_version,
--   DROP COLUMN IF EXISTS dependency_fingerprint,
--   DROP COLUMN IF EXISTS computation_generation,
--   DROP COLUMN IF EXISTS response_state,
--   DROP COLUMN IF EXISTS day_provenance,
--   DROP COLUMN IF EXISTS added_sugar_coverage,
--   DROP COLUMN IF EXISTS readings,
--   DROP COLUMN IF EXISTS computed_as_of;

-- ---------------------------------------------------------------------------
-- 4. Verification
-- ---------------------------------------------------------------------------
SELECT trigger_name
FROM information_schema.triggers
WHERE event_object_table = 'journal_entries'
ORDER BY trigger_name;

SELECT to_regclass('public.journal_day_revisions') AS revisions_table,
       to_regclass('public.nds_recompute_work')    AS work_table,
       to_regprocedure('public.enqueue_nds_recompute()') AS legacy_enqueue_fn;
