-- ============================================================================
-- NDS Integrity v1 — Step 03: LEGACY QUEUE CUTOVER (executable)
-- ============================================================================
--
-- Packet: FD-PLATFORM-NDS-01A. Run AFTER steps 01 and 02, and BEFORE step 04
-- (contract). Safe to run repeatedly.
--
-- LOCAL APPLICATION ONLY by the packet that produced it. No remote execution.
--
-- Why this file exists
-- --------------------
-- The reviewed step 03 told the operator to "drain the legacy queue via the new
-- worker" and then refused to contract while any legacy row was still
-- pending/processing. Nothing ever moved those rows: the new worker reads
-- nds_recompute_work and has no knowledge of nds_recompute_queue. The documented
-- procedure therefore could not terminate — the gate would block forever, and the
-- only ways past it were to abandon the outstanding recomputes or to falsify the
-- legacy status to satisfy the check. Neither is acceptable for days whose scores
-- are user-visible.
--
-- This step replaces that prose with a transfer that runs, is idempotent, records
-- what it did, and can be audited afterwards.
--
-- Day identity during transfer
-- ----------------------------
-- A legacy row carries only (person_id, date_local), and its date_local was
-- derived from the server's UTC interpretation of occurred_at — the very defect
-- this migration corrects. Requesting work for that literal date alone would
-- recompute the wrong day whenever the two disagree.
--
-- So each legacy row is expanded into the set of days that its entries actually
-- belong to under the corrected policy, PLUS the literal legacy date. The extra
-- day is deliberate: recomputing a day that was already correct is idempotent and
-- cheap, whereas missing one leaves a stale user-visible score.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Transfer provenance
-- ---------------------------------------------------------------------------
-- The legacy row's OWN status is never rewritten. Editing it would destroy the
-- operational history the table is being kept for, and a status forced to
-- 'completed' to satisfy a gate is a false record of work that never ran.
-- Transfer is tracked as separate, additive provenance.

ALTER TABLE public.nds_recompute_queue
  ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ;

COMMENT ON COLUMN public.nds_recompute_queue.transferred_at IS
  'When this legacy row was transferred into nds_recompute_work by nds_transfer_legacy_queue. NULL means still untransferred. The row status is left untouched.';

CREATE TABLE IF NOT EXISTS public.nds_legacy_transfer_ledger (
  id                  BIGSERIAL PRIMARY KEY,
  -- Matches nds_recompute_queue.id, which is a UUID.
  legacy_queue_id     UUID NOT NULL,
  person_id           UUID NOT NULL,

  -- Both are recorded so a reviewer can see every case where the legacy UTC day
  -- and the corrected consumed day disagreed.
  legacy_date_local   DATE NOT NULL,
  requested_date_local DATE NOT NULL,

  legacy_status       TEXT NOT NULL,
  requested_revision  BIGINT NOT NULL,
  transferred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Makes re-running the transfer a no-op rather than a duplicate ledger entry.
  UNIQUE (legacy_queue_id, requested_date_local)
);

COMMENT ON TABLE public.nds_legacy_transfer_ledger IS
  'Audit record of legacy nds_recompute_queue rows transferred into nds_recompute_work, including any legacy/corrected day disagreement. Written only by nds_transfer_legacy_queue.';

ALTER TABLE public.nds_legacy_transfer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nds_legacy_transfer_ledger FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. The transfer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nds_transfer_legacy_queue()
RETURNS TABLE (transferred BIGINT, already_present BIGINT, days_requested BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row         RECORD;
  v_day         DATE;
  v_revision    BIGINT;
  v_transferred BIGINT := 0;
  v_already     BIGINT := 0;
  v_days        BIGINT := 0;
  v_new_days    BIGINT;
BEGIN
  IF to_regclass('public.nds_recompute_queue') IS NULL THEN
    RETURN QUERY SELECT 0::BIGINT, 0::BIGINT, 0::BIGINT;
    RETURN;
  END IF;

  -- Locked so two operators, or an operator and a retry, cannot interleave and
  -- double-count. SKIP LOCKED is deliberately NOT used: a row another session
  -- holds must be waited for, not silently left untransferred.
  FOR v_row IN
    SELECT q.id, q.person_id, q.date_local, q.status, q.transferred_at
    FROM public.nds_recompute_queue q
    WHERE q.status IN ('pending', 'processing')
    ORDER BY q.id
    FOR UPDATE
  LOOP
    v_new_days := 0;

    FOR v_day IN
      -- The literal legacy day, plus every day its entries actually fall on.
      SELECT v_row.date_local
      UNION
      SELECT DISTINCT public.nds_consumed_day(j.payload, j.occurred_at)
      FROM public.journal_entries j
      WHERE j.person_id = v_row.person_id
        AND public.nds_is_consumption_row(j.entry_type)
        -- Bounded by the legacy day plus a day either side: no offset in use
        -- moves a consumed instant further than that, and an unbounded scan of a
        -- person's whole journal is not acceptable during a cutover window.
        AND j.occurred_at >= (v_row.date_local - 1)::TIMESTAMPTZ
        AND j.occurred_at <  (v_row.date_local + 2)::TIMESTAMPTZ
    LOOP
      CONTINUE WHEN v_day IS NULL;

      -- Requested at the CURRENT revision, so a mutation landing after this
      -- transfer still supersedes it.
      SELECT COALESCE(MAX(r.revision), 0) INTO v_revision
      FROM public.journal_day_revisions r
      WHERE r.person_id = v_row.person_id AND r.date_local = v_day;

      PERFORM public.nds_request_work(v_row.person_id, v_day, COALESCE(v_revision, 0));

      INSERT INTO public.nds_legacy_transfer_ledger (
        legacy_queue_id, person_id, legacy_date_local, requested_date_local,
        legacy_status, requested_revision
      )
      VALUES (
        v_row.id, v_row.person_id, v_row.date_local, v_day,
        v_row.status, COALESCE(v_revision, 0)
      )
      ON CONFLICT (legacy_queue_id, requested_date_local) DO NOTHING;

      IF FOUND THEN
        v_new_days := v_new_days + 1;
        v_days := v_days + 1;
      END IF;
    END LOOP;

    IF v_row.transferred_at IS NULL THEN
      UPDATE public.nds_recompute_queue
         SET transferred_at = NOW()
       WHERE id = v_row.id;
      v_transferred := v_transferred + 1;
    ELSE
      v_already := v_already + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_transferred, v_already, v_days;
END;
$$;

COMMENT ON FUNCTION public.nds_transfer_legacy_queue() IS
  'Moves outstanding legacy nds_recompute_queue work into nds_recompute_work at the current revision, expanding each row to its corrected consumed day(s). Idempotent; never rewrites legacy status.';

-- ---------------------------------------------------------------------------
-- 3. The contract gate
-- ---------------------------------------------------------------------------
-- Named and callable so it can be exercised as a check before an operator runs
-- the destructive step, instead of being discovered mid-migration.

CREATE OR REPLACE FUNCTION public.nds_assert_ready_to_contract()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_untransferred BIGINT;
  v_unversioned   BIGINT;
BEGIN
  IF to_regclass('public.nds_recompute_work') IS NULL THEN
    RAISE EXCEPTION 'nds_recompute_work is missing: apply step 02 before contracting';
  END IF;

  -- Order matters. While the legacy enqueue trigger is attached, a journal write
  -- can add a legacy row AFTER the transfer has read the table, so "transfer then
  -- contract" would race and lose that work. The trigger must be detached first,
  -- and the transfer run against a table that can no longer grow.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.journal_entries'::regclass
      AND tgname = 'trigger_enqueue_nds_recompute'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'legacy enqueue trigger is still attached: detach trigger_enqueue_nds_recompute, then run nds_transfer_legacy_queue(), then contract'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF to_regclass('public.nds_recompute_queue') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_untransferred
    FROM public.nds_recompute_queue
    WHERE status IN ('pending', 'processing')
      AND transferred_at IS NULL;

    IF v_untransferred > 0 THEN
      RAISE EXCEPTION
        'legacy nds_recompute_queue has % outstanding untransferred row(s): run nds_transfer_legacy_queue() first', v_untransferred
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;

  -- Reported, not fatal: unversioned rows are treated as invalid and recomputed
  -- on read, so they do not block the cutover.
  SELECT COUNT(*) INTO v_unversioned
  FROM public.daily_nds
  WHERE source_revision IS NULL;

  RETURN format(
    'ready to contract; %s daily_nds row(s) without source_revision will be recomputed on read',
    v_unversioned
  );
END;
$$;

COMMENT ON FUNCTION public.nds_assert_ready_to_contract() IS
  'Raises unless the legacy enqueue trigger is detached and every outstanding legacy row has been transferred. Callable as a pre-check before step 04.';

REVOKE ALL ON public.nds_legacy_transfer_ledger FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_transfer_legacy_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_assert_ready_to_contract() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Verification (read-only)
-- ---------------------------------------------------------------------------

-- Untransferred outstanding legacy rows. Must be 0 before step 04.
SELECT COUNT(*) AS legacy_outstanding_untransferred
FROM public.nds_recompute_queue
WHERE status IN ('pending', 'processing') AND transferred_at IS NULL;

-- Every case where the legacy UTC day disagreed with the corrected consumed day.
SELECT legacy_date_local, requested_date_local, COUNT(*) AS rows
FROM public.nds_legacy_transfer_ledger
WHERE legacy_date_local IS DISTINCT FROM requested_date_local
GROUP BY legacy_date_local, requested_date_local
ORDER BY legacy_date_local;
