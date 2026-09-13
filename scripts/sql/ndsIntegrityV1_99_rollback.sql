-- ============================================================================
-- NDS Integrity v1 — Step 99: ROLLBACK
-- ============================================================================
--
-- Packet: FD-PLATFORM-NDS-01A. Reverses steps 01–04 in the correct order.
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
-- 0. Release the daily_nds writer fence (undo step 02's fence)
-- ---------------------------------------------------------------------------
-- THIS MUST COME FIRST, and it is not optional.
--
-- Step 02 installs trigger_nds_guard_daily_nds_writer, which refuses any write to
-- an authoritative daily_nds row that does not arrive through
-- nds_publish_daily_score. That fence is what makes a partial rollout safe, but it
-- also means the pre-v1 code path CANNOT write scores while it is attached: those
-- writes carry no publishing flag and target rows that now have a source_revision.
--
-- The reviewed rollback omitted this, so following it would have restored the old
-- application into a database that rejected all of its NDS writes — every day
-- would have silently stopped updating.

-- Make retained repaired materializations non-authoritative BEFORE restoring
-- legacy writers. Leaving validity metadata current while dropping the fence
-- would let an old write keep a v1-looking cache that the repaired reader
-- could still accept. The publishing flag is required because the fence is
-- still attached at this point.
SELECT set_config('nds.publishing', 'on', TRUE);

UPDATE public.daily_nds
   SET computation_generation = 0,
       source_revision = NULL,
       response_state = NULL
 WHERE computation_generation IS NOT NULL
    OR source_revision IS NOT NULL
    OR response_state IS NOT NULL;

INSERT INTO public.nds_computation_generation (
  id, generation, nds_version, classifier_version, normalizer_version, day_policy_version
)
VALUES (
  TRUE, 1,
  'nds_daily_rolled_back',
  'classifier_rolled_back',
  'normalizer_rolled_back',
  'day_policy_rolled_back'
)
ON CONFLICT (id) DO UPDATE
   SET generation = public.nds_computation_generation.generation + 1,
       nds_version = EXCLUDED.nds_version,
       classifier_version = EXCLUDED.classifier_version,
       normalizer_version = EXCLUDED.normalizer_version,
       day_policy_version = EXCLUDED.day_policy_version,
       updated_at = NOW();

DROP TRIGGER IF EXISTS trigger_nds_guard_daily_nds_writer ON public.daily_nds;
DROP FUNCTION IF EXISTS public.nds_guard_daily_nds_writer();

-- The state contract is dropped with it. The pre-v1 writer leaves response_state
-- NULL, which the constraint permits, but it also writes zeros for days it cannot
-- verify; leaving the constraint attached would convert that into a hard error at
-- an unrelated call site.
ALTER TABLE public.daily_nds DROP CONSTRAINT IF EXISTS daily_nds_state_numeric_contract;

-- Score columns are left NULLABLE. Restoring NOT NULL would fail against any row
-- this migration legitimately stored as empty or insufficient_data, and a nullable
-- column is not a problem for the old code path, which always writes a number.

-- ---------------------------------------------------------------------------
-- 1. Restore the legacy enqueue path (undo step 04)
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

-- trigger_nds_request_work no longer exists in the corrected migration; the drop
-- is retained because a cluster that received the earlier expand still has it.
DROP TRIGGER IF EXISTS trigger_nds_request_work ON public.journal_entries;
DROP TRIGGER IF EXISTS trigger_nds_track_journal_day_revision ON public.journal_entries;

DROP FUNCTION IF EXISTS public.nds_request_work_for_journal_change();
DROP FUNCTION IF EXISTS public.nds_track_journal_day_revision();

-- Reduced to a no-op rather than dropped: journal_day_revisions may still be
-- present with the step 01 trigger recreated by a later re-apply, and a missing
-- hook would then break that trigger outright.
CREATE OR REPLACE FUNCTION public.nds_after_day_revision_bump(
  p_person_id UUID, p_date_local DATE, p_revision BIGINT, p_change_kind TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN;
END;
$$;

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
-- DROP FUNCTION IF EXISTS public.nds_assert_ready_to_contract();
-- DROP FUNCTION IF EXISTS public.nds_transfer_legacy_queue();
-- DROP FUNCTION IF EXISTS public.nds_fail_work(UUID, DATE, UUID, TEXT, INTEGER);
-- DROP FUNCTION IF EXISTS public.nds_complete_work(UUID, DATE, UUID, BIGINT, BIGINT);
-- DROP FUNCTION IF EXISTS public.nds_claim_work(INTEGER, INTEGER);
-- DROP FUNCTION IF EXISTS public.nds_request_work(UUID, DATE, BIGINT);
-- DROP FUNCTION IF EXISTS public.nds_work_is_outstanding(BIGINT, BIGINT, BIGINT, BIGINT);
-- DROP FUNCTION IF EXISTS public.nds_publish_daily_score(
--   UUID, DATE, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
--   NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, JSONB,
--   INTEGER, INTEGER, JSONB
-- );
-- DROP FUNCTION IF EXISTS public.nds_read_day_snapshot(UUID, DATE);
-- DROP FUNCTION IF EXISTS public.nds_advance_generation(TEXT, TEXT, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.nds_active_generation();
-- DROP FUNCTION IF EXISTS public.nds_after_day_revision_bump(UUID, DATE, BIGINT, TEXT);
-- DROP FUNCTION IF EXISTS public.nds_bump_day_revision(UUID, DATE, TEXT);
-- DROP FUNCTION IF EXISTS public.nds_consumed_day(JSONB, TIMESTAMPTZ);
-- DROP FUNCTION IF EXISTS public.nds_is_consumption_row(TEXT);

-- DROP TABLE IF EXISTS public.nds_legacy_transfer_ledger;
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
--   DROP COLUMN IF EXISTS scored_entry_count,
--   DROP COLUMN IF EXISTS unscorable_entry_count,
--   DROP COLUMN IF EXISTS limitations,
--   DROP COLUMN IF EXISTS computed_as_of;

-- ALTER TABLE public.nds_recompute_queue DROP COLUMN IF EXISTS transferred_at;

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

-- The fence must be gone and the old writer must be able to write again.
SELECT
  NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.daily_nds'::regclass
      AND tgname = 'trigger_nds_guard_daily_nds_writer'
      AND NOT tgisinternal
  ) AS writer_fence_released,
  NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.daily_nds'::regclass
      AND conname = 'daily_nds_state_numeric_contract'
  ) AS state_contract_released;
