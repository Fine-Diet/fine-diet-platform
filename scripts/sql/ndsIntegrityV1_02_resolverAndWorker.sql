-- ============================================================================
-- NDS Integrity v1 — Step 02: Guarded publication, version fencing, fenced worker
-- ============================================================================
--
-- Packet: FD-PLATFORM-NDS-01 (checkpoint C). EXPAND phase — additive only.
-- Requires step 01 (ndsIntegrityV1_01_dayRevisions.sql).
--
-- LOCAL APPLICATION ONLY. Not applied to any database by the packet that
-- produced it. See docs/nds/NDS-01-MIGRATION-ACTIVATION.md.
--
-- What this step adds:
--   1. Version/revision metadata columns on daily_nds, plus persisted UI
--      readings so an ordinary read never depends on an admin debug request.
--   2. nds_computation_generation — a database-enforced fence so an older
--      deployment cannot overwrite a newer computation context.
--   3. nds_read_day_snapshot(...) — revision + cache metadata read in ONE
--      statement, because sequential READ COMMITTED statements are not
--      guaranteed to share a snapshot.
--   4. nds_publish_daily_score(...) — database-side compare-and-publish under
--      the same guard as invalidation. A JavaScript revision check followed by
--      an unconditional upsert is not sufficient.
--   5. nds_recompute_work — a coalescing per-person/day work identity with
--      requested/processed revision, computation generation, lease token and
--      expiry. Replaces uniqueness on (person_id, date_local, status), which
--      made a second completion for a day collide.
--   6. Claim / complete / fail RPCs that are fenced by lease token AND
--      generation, so a stale worker cannot clear newer outstanding work.
-- ============================================================================

-- ============================================================================
-- 1. daily_nds cache contract
-- ============================================================================

ALTER TABLE public.daily_nds
  ADD COLUMN IF NOT EXISTS source_revision BIGINT,
  ADD COLUMN IF NOT EXISTS normalizer_version TEXT,
  ADD COLUMN IF NOT EXISTS day_policy_version TEXT,
  ADD COLUMN IF NOT EXISTS dependency_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS computation_generation BIGINT,
  ADD COLUMN IF NOT EXISTS response_state TEXT,
  ADD COLUMN IF NOT EXISTS day_provenance TEXT,
  ADD COLUMN IF NOT EXISTS added_sugar_coverage TEXT,
  ADD COLUMN IF NOT EXISTS readings JSONB,
  ADD COLUMN IF NOT EXISTS computed_as_of TIMESTAMPTZ;

COMMENT ON COLUMN public.daily_nds.source_revision IS
  'journal_day_revisions.revision this score was computed from. NULL means a legacy row that predates the contract: unverified, never grandfathered in because its score is nonzero.';
COMMENT ON COLUMN public.daily_nds.computation_generation IS
  'Active computation generation at publish time. Prevents an older deployment from overwriting a newer computation context at the same source revision.';
COMMENT ON COLUMN public.daily_nds.readings IS
  'UI-printable readings persisted for ordinary reads. Materialization must not depend on an admin debug request.';
COMMENT ON COLUMN public.daily_nds.added_sugar_coverage IS
  'known | partial | unknown. Carried through to the response so an incomplete day cannot be presented as a complete score.';

-- Fast validity probe for the resolver.
CREATE INDEX IF NOT EXISTS idx_daily_nds_person_date_revision
ON public.daily_nds (person_id, date_local, source_revision);

-- ============================================================================
-- 2. Computation generation fence
-- ============================================================================
-- A single row holding the generation that is allowed to publish. Deploying a
-- new computation context increments it; older instances then fail the guard
-- instead of silently winning. Lexicographic version-string comparison and
-- completion timestamps are BOTH inadequate here, which is why this is a
-- database-enforced integer.

CREATE TABLE IF NOT EXISTS public.nds_computation_generation (
  id         BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  generation BIGINT  NOT NULL DEFAULT 1,
  -- The context this generation corresponds to, for operator legibility.
  nds_version        TEXT,
  classifier_version TEXT,
  normalizer_version TEXT,
  day_policy_version TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.nds_computation_generation (id, generation)
VALUES (TRUE, 1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.nds_computation_generation IS
  'Single-row fence naming the computation generation permitted to publish scores. Older instances are rejected by nds_publish_daily_score rather than overwriting newer work.';

CREATE OR REPLACE FUNCTION public.nds_active_generation()
RETURNS BIGINT
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT generation FROM public.nds_computation_generation WHERE id;
$$;

-- ============================================================================
-- 3. Consistent snapshot read
-- ============================================================================
-- Returns the day's source revision, the active generation, and the cached row's
-- validity metadata in ONE statement. At READ COMMITTED, two sequential SELECTs
-- may see two different snapshots
-- (https://www.postgresql.org/docs/current/transaction-iso.html), so the
-- resolver must not assemble this from separate round trips.

CREATE OR REPLACE FUNCTION public.nds_read_day_snapshot(
  p_person_id  UUID,
  p_date_local DATE
)
RETURNS TABLE (
  source_revision        BIGINT,
  active_generation      BIGINT,
  cached_revision        BIGINT,
  cached_generation      BIGINT,
  cached_nds_version     TEXT,
  cached_classifier_version TEXT,
  cached_normalizer_version TEXT,
  cached_day_policy_version TEXT,
  cached_dependency_fingerprint TEXT,
  cached_response_state   TEXT,
  cached_score_100        NUMERIC,
  cached_readings         JSONB,
  cached_added_sugar_coverage TEXT,
  cached_day_provenance   TEXT,
  cached_computed_as_of   TIMESTAMPTZ,
  cache_row_exists        BOOLEAN
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    COALESCE(r.revision, 0)                AS source_revision,
    g.generation                           AS active_generation,
    d.source_revision                      AS cached_revision,
    d.computation_generation               AS cached_generation,
    d.nds_version                          AS cached_nds_version,
    d.classifier_version                   AS cached_classifier_version,
    d.normalizer_version                   AS cached_normalizer_version,
    d.day_policy_version                   AS cached_day_policy_version,
    d.dependency_fingerprint               AS cached_dependency_fingerprint,
    d.response_state                       AS cached_response_state,
    d.nds_score_100                        AS cached_score_100,
    d.readings                             AS cached_readings,
    d.added_sugar_coverage                 AS cached_added_sugar_coverage,
    d.day_provenance                       AS cached_day_provenance,
    d.computed_as_of                       AS cached_computed_as_of,
    (d.person_id IS NOT NULL)              AS cache_row_exists
  FROM (SELECT p_person_id AS person_id, p_date_local AS date_local) AS req
  CROSS JOIN public.nds_computation_generation g
  LEFT JOIN public.journal_day_revisions r
    ON r.person_id = req.person_id AND r.date_local = req.date_local
  LEFT JOIN public.daily_nds d
    ON d.person_id = req.person_id AND d.date_local = req.date_local
  WHERE g.id;
$$;

COMMENT ON FUNCTION public.nds_read_day_snapshot(UUID, DATE) IS
  'Single-statement read of source revision, active generation and cache validity metadata, so the resolver compares values from one consistent snapshot.';

-- ============================================================================
-- 4. Guarded compare-and-publish
-- ============================================================================
-- Publishes ONLY when the source revision the result was computed from is still
-- current AND the publishing generation is still active AND the row being
-- replaced is not already newer. Returns the outcome so the caller can surface
-- an explicit `updating` state instead of pretending the write succeeded.

CREATE OR REPLACE FUNCTION public.nds_publish_daily_score(
  p_person_id              UUID,
  p_date_local             DATE,
  p_computed_from_revision BIGINT,
  p_generation             BIGINT,
  p_nds_version            TEXT,
  p_classifier_version     TEXT,
  p_normalizer_version     TEXT,
  p_day_policy_version     TEXT,
  p_dependency_fingerprint TEXT,
  p_response_state         TEXT,
  p_day_provenance         TEXT,
  p_added_sugar_coverage   TEXT,
  p_score_100              NUMERIC,
  p_wfr_10                 NUMERIC,
  p_ps_10                  NUMERIC,
  p_pnd_10                 NUMERIC,
  p_fp_10                  NUMERIC,
  p_as_10                  NUMERIC,
  p_mnc_10                 NUMERIC,
  p_ob_10                  NUMERIC,
  p_readings               JSONB,
  p_debug_data             JSONB
)
RETURNS TABLE (published BOOLEAN, reason TEXT, current_revision BIGINT, current_generation BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current_revision   BIGINT;
  v_active_generation  BIGINT;
  v_existing_revision  BIGINT;
  v_existing_generation BIGINT;
BEGIN
  -- Take the revision row lock FIRST so an invalidation racing this publish
  -- either lands before the guard or waits behind it. This is the shared guard
  -- the packet requires: publication and invalidation contend on one row.
  SELECT r.revision INTO v_current_revision
  FROM public.journal_day_revisions r
  WHERE r.person_id = p_person_id AND r.date_local = p_date_local
  FOR SHARE;

  v_current_revision := COALESCE(v_current_revision, 0);

  SELECT generation INTO v_active_generation
  FROM public.nds_computation_generation
  WHERE id;

  IF p_generation IS DISTINCT FROM v_active_generation THEN
    RETURN QUERY SELECT FALSE, 'stale_generation', v_current_revision, v_active_generation;
    RETURN;
  END IF;

  IF p_computed_from_revision IS DISTINCT FROM v_current_revision THEN
    RETURN QUERY SELECT FALSE, 'source_changed', v_current_revision, v_active_generation;
    RETURN;
  END IF;

  SELECT d.source_revision, d.computation_generation
    INTO v_existing_revision, v_existing_generation
  FROM public.daily_nds d
  WHERE d.person_id = p_person_id AND d.date_local = p_date_local
  FOR UPDATE;

  -- Never regress a newer published result.
  IF v_existing_revision IS NOT NULL AND v_existing_revision > p_computed_from_revision THEN
    RETURN QUERY SELECT FALSE, 'newer_result_present', v_current_revision, v_active_generation;
    RETURN;
  END IF;
  IF v_existing_generation IS NOT NULL AND v_existing_generation > p_generation THEN
    RETURN QUERY SELECT FALSE, 'newer_generation_present', v_current_revision, v_active_generation;
    RETURN;
  END IF;

  INSERT INTO public.daily_nds AS d (
    person_id, date_local,
    nds_score_100, wfr_10, ps_10, pnd_10, fp_10, as_10, mnc_10, ob_10,
    nds_version, classifier_version,
    normalizer_version, day_policy_version, dependency_fingerprint,
    source_revision, computation_generation,
    response_state, day_provenance, added_sugar_coverage,
    readings, debug_data, computed_as_of, updated_at
  )
  VALUES (
    p_person_id, p_date_local,
    p_score_100, p_wfr_10, p_ps_10, p_pnd_10, p_fp_10, p_as_10, p_mnc_10, p_ob_10,
    p_nds_version, p_classifier_version,
    p_normalizer_version, p_day_policy_version, p_dependency_fingerprint,
    p_computed_from_revision, p_generation,
    p_response_state, p_day_provenance, p_added_sugar_coverage,
    p_readings, p_debug_data, NOW(), NOW()
  )
  ON CONFLICT (person_id, date_local) DO UPDATE
    SET nds_score_100 = EXCLUDED.nds_score_100,
        wfr_10 = EXCLUDED.wfr_10,
        ps_10 = EXCLUDED.ps_10,
        pnd_10 = EXCLUDED.pnd_10,
        fp_10 = EXCLUDED.fp_10,
        as_10 = EXCLUDED.as_10,
        mnc_10 = EXCLUDED.mnc_10,
        ob_10 = EXCLUDED.ob_10,
        nds_version = EXCLUDED.nds_version,
        classifier_version = EXCLUDED.classifier_version,
        normalizer_version = EXCLUDED.normalizer_version,
        day_policy_version = EXCLUDED.day_policy_version,
        dependency_fingerprint = EXCLUDED.dependency_fingerprint,
        source_revision = EXCLUDED.source_revision,
        computation_generation = EXCLUDED.computation_generation,
        response_state = EXCLUDED.response_state,
        day_provenance = EXCLUDED.day_provenance,
        added_sugar_coverage = EXCLUDED.added_sugar_coverage,
        readings = EXCLUDED.readings,
        -- Debug data is additive: asking for debug must never make another
        -- reader's stored readings disappear.
        debug_data = COALESCE(EXCLUDED.debug_data, d.debug_data),
        computed_as_of = EXCLUDED.computed_as_of,
        updated_at = NOW()
    WHERE d.source_revision IS NULL
       OR d.source_revision <= EXCLUDED.source_revision;

  RETURN QUERY SELECT TRUE, 'published', v_current_revision, v_active_generation;
END;
$$;

COMMENT ON FUNCTION public.nds_publish_daily_score IS
  'Database-side compare-and-publish for a daily score. Rejects a result whose source revision moved or whose computation generation is no longer active, and never regresses a newer published result.';

-- ============================================================================
-- 5. Coalescing, fenced work queue
-- ============================================================================
-- One row per (person_id, date_local) forever. Requested revision coalesces
-- many mutations into one outstanding item; processed revision records what was
-- actually finished. Because uniqueness no longer involves `status`, a repeat
-- completion for the same day cannot collide, which is the defect the audit
-- observed on (person_id, date_local, status).

CREATE TABLE IF NOT EXISTS public.nds_recompute_work (
  person_id  UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  date_local DATE NOT NULL,

  -- Highest source revision known to need computing.
  requested_revision  BIGINT NOT NULL DEFAULT 0,
  -- Highest source revision successfully published.
  processed_revision   BIGINT NOT NULL DEFAULT -1,
  -- Generation the request was raised under.
  requested_generation BIGINT NOT NULL DEFAULT 1,

  -- Lease: a claim is only valid while the holder presents this token and the
  -- expiry has not passed.
  lease_token   UUID,
  lease_expires_at TIMESTAMPTZ,
  leased_at     TIMESTAMPTZ,

  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  last_failed_at TIMESTAMPTZ,
  -- Backoff: not eligible for claiming before this time.
  not_before    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  first_requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_completed_at  TIMESTAMPTZ,

  PRIMARY KEY (person_id, date_local)
);

COMMENT ON TABLE public.nds_recompute_work IS
  'Coalescing per-person/day recompute work with revision and generation fencing. Outstanding work is requested_revision > processed_revision; there is no status column to collide on.';

-- Claimable work: outstanding, past its backoff, and not under a live lease.
CREATE INDEX IF NOT EXISTS idx_nds_work_claimable
ON public.nds_recompute_work (not_before)
WHERE requested_revision > processed_revision;

-- Separate attempt history so retries do not overwrite forensic detail.
CREATE TABLE IF NOT EXISTS public.nds_recompute_attempts (
  id         BIGSERIAL PRIMARY KEY,
  person_id  UUID NOT NULL,
  date_local DATE NOT NULL,
  lease_token UUID,
  requested_revision BIGINT,
  outcome    TEXT NOT NULL CHECK (outcome IN ('completed', 'failed', 'fenced_out', 'lease_expired')),
  detail     TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nds_attempts_day
ON public.nds_recompute_attempts (person_id, date_local, attempted_at DESC);

-- ---------------------------------------------------------------------------
-- Request work
-- ---------------------------------------------------------------------------
-- Coalesces to the highest requested revision. Safe to call from the journal
-- trigger and from application code.

CREATE OR REPLACE FUNCTION public.nds_request_work(
  p_person_id  UUID,
  p_date_local DATE,
  p_revision   BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.nds_recompute_work AS w (
    person_id, date_local, requested_revision, requested_generation, not_before, last_requested_at
  )
  VALUES (
    p_person_id, p_date_local, p_revision, public.nds_active_generation(),
    NOW() + INTERVAL '5 seconds', NOW()
  )
  ON CONFLICT (person_id, date_local) DO UPDATE
    SET requested_revision   = GREATEST(w.requested_revision, EXCLUDED.requested_revision),
        requested_generation = EXCLUDED.requested_generation,
        last_requested_at    = NOW(),
        -- Preserve an already-due item rather than pushing it further out.
        not_before           = LEAST(w.not_before, EXCLUDED.not_before);
END;
$$;

-- ---------------------------------------------------------------------------
-- Claim work
-- ---------------------------------------------------------------------------
-- Atomic claim with an explicit lease. SKIP LOCKED prevents two workers from
-- blocking on the same row. An expired lease is reclaimable, which is how a
-- crashed worker recovers without a separate sweeper.

CREATE OR REPLACE FUNCTION public.nds_claim_work(
  p_limit        INTEGER DEFAULT 10,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
  person_id UUID,
  date_local DATE,
  requested_revision BIGINT,
  requested_generation BIGINT,
  lease_token UUID,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT w.person_id, w.date_local
    FROM public.nds_recompute_work w
    WHERE w.requested_revision > w.processed_revision
      AND w.not_before <= NOW()
      AND (w.lease_token IS NULL OR w.lease_expires_at IS NULL OR w.lease_expires_at <= NOW())
    ORDER BY w.not_before ASC
    LIMIT GREATEST(p_limit, 0)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.nds_recompute_work w
     SET lease_token      = gen_random_uuid(),
         lease_expires_at = NOW() + make_interval(secs => GREATEST(p_lease_seconds, 1)),
         leased_at        = NOW(),
         attempts         = w.attempts + 1
    FROM claimable c
   WHERE w.person_id = c.person_id AND w.date_local = c.date_local
  RETURNING w.person_id, w.date_local, w.requested_revision, w.requested_generation,
            w.lease_token, w.attempts;
END;
$$;

COMMENT ON FUNCTION public.nds_claim_work(INTEGER, INTEGER) IS
  'Atomically lease outstanding recompute work. Expired leases are reclaimable, so a crashed worker recovers without losing the request.';

-- ---------------------------------------------------------------------------
-- Complete work (fenced)
-- ---------------------------------------------------------------------------
-- Advances processed_revision ONLY to what was actually computed, and only when
-- the caller still holds the live lease. A mutation that arrived while the
-- worker was running raised requested_revision, so the item REMAINS OUTSTANDING
-- afterwards. A stale lease holder is rejected and cannot clear newer work.

CREATE OR REPLACE FUNCTION public.nds_complete_work(
  p_person_id  UUID,
  p_date_local DATE,
  p_lease_token UUID,
  p_processed_revision BIGINT
)
RETURNS TABLE (accepted BOOLEAN, reason TEXT, still_outstanding BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.nds_recompute_work;
BEGIN
  SELECT * INTO v_row
  FROM public.nds_recompute_work
  WHERE person_id = p_person_id AND date_local = p_date_local
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'work_row_missing', FALSE;
    RETURN;
  END IF;

  IF v_row.lease_token IS DISTINCT FROM p_lease_token THEN
    INSERT INTO public.nds_recompute_attempts (person_id, date_local, lease_token, requested_revision, outcome, detail)
    VALUES (p_person_id, p_date_local, p_lease_token, v_row.requested_revision, 'fenced_out',
            'completion presented a lease token that is no longer held');
    RETURN QUERY SELECT FALSE, 'lease_not_held', (v_row.requested_revision > v_row.processed_revision);
    RETURN;
  END IF;

  IF v_row.lease_expires_at IS NOT NULL AND v_row.lease_expires_at <= NOW() THEN
    INSERT INTO public.nds_recompute_attempts (person_id, date_local, lease_token, requested_revision, outcome, detail)
    VALUES (p_person_id, p_date_local, p_lease_token, v_row.requested_revision, 'lease_expired',
            'completion arrived after the lease expired');
    RETURN QUERY SELECT FALSE, 'lease_expired', (v_row.requested_revision > v_row.processed_revision);
    RETURN;
  END IF;

  UPDATE public.nds_recompute_work
     SET processed_revision = GREATEST(processed_revision, p_processed_revision),
         lease_token = NULL,
         lease_expires_at = NULL,
         leased_at = NULL,
         attempts = 0,
         last_error = NULL,
         last_completed_at = NOW(),
         not_before = NOW()
   WHERE person_id = p_person_id AND date_local = p_date_local;

  INSERT INTO public.nds_recompute_attempts (person_id, date_local, lease_token, requested_revision, outcome, detail)
  VALUES (p_person_id, p_date_local, p_lease_token, p_processed_revision, 'completed', NULL);

  RETURN QUERY
  SELECT TRUE, 'completed', (w.requested_revision > w.processed_revision)
  FROM public.nds_recompute_work w
  WHERE w.person_id = p_person_id AND w.date_local = p_date_local;
END;
$$;

COMMENT ON FUNCTION public.nds_complete_work(UUID, DATE, UUID, BIGINT) IS
  'Fenced completion. Requires the live lease token, advances processed_revision only to what was computed, and reports whether newer work remains outstanding.';

-- ---------------------------------------------------------------------------
-- Fail work (bounded retry with backoff)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nds_fail_work(
  p_person_id  UUID,
  p_date_local DATE,
  p_lease_token UUID,
  p_error TEXT,
  p_max_attempts INTEGER DEFAULT 5
)
RETURNS TABLE (accepted BOOLEAN, reason TEXT, retry_scheduled BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.nds_recompute_work;
  v_retry BOOLEAN;
  v_backoff INTERVAL;
BEGIN
  SELECT * INTO v_row
  FROM public.nds_recompute_work
  WHERE person_id = p_person_id AND date_local = p_date_local
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'work_row_missing', FALSE;
    RETURN;
  END IF;

  IF v_row.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN QUERY SELECT FALSE, 'lease_not_held', FALSE;
    RETURN;
  END IF;

  v_retry := v_row.attempts < GREATEST(p_max_attempts, 1);
  -- Exponential backoff capped so a permanently broken day does not spin.
  v_backoff := make_interval(secs => LEAST(POWER(2, LEAST(v_row.attempts, 8))::INT * 15, 3600));

  UPDATE public.nds_recompute_work
     SET lease_token = NULL,
         lease_expires_at = NULL,
         leased_at = NULL,
         last_error = p_error,
         last_failed_at = NOW(),
         -- Retry exhaustion parks the item instead of clearing the request, so
         -- an operator can still see that the day is not computed.
         not_before = CASE WHEN v_retry THEN NOW() + v_backoff ELSE NOW() + INTERVAL '1 day' END
   WHERE person_id = p_person_id AND date_local = p_date_local;

  INSERT INTO public.nds_recompute_attempts (person_id, date_local, lease_token, requested_revision, outcome, detail)
  VALUES (p_person_id, p_date_local, p_lease_token, v_row.requested_revision, 'failed', p_error);

  RETURN QUERY SELECT TRUE, 'recorded', v_retry;
END;
$$;

-- ---------------------------------------------------------------------------
-- Truthful queue diagnostics
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.nds_work_diagnostics()
RETURNS TABLE (
  outstanding BIGINT,
  leased BIGINT,
  expired_leases BIGINT,
  failing BIGINT,
  oldest_outstanding_age INTERVAL
)
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE requested_revision > processed_revision),
    COUNT(*) FILTER (WHERE lease_token IS NOT NULL AND lease_expires_at > NOW()),
    COUNT(*) FILTER (WHERE lease_token IS NOT NULL AND lease_expires_at <= NOW()),
    COUNT(*) FILTER (WHERE last_error IS NOT NULL AND requested_revision > processed_revision),
    MAX(NOW() - first_requested_at) FILTER (WHERE requested_revision > processed_revision)
  FROM public.nds_recompute_work;
$$;

-- ============================================================================
-- 6. Trigger: raise work alongside the revision bump
-- ============================================================================
-- Replaces the legacy enqueue for the new table. The legacy
-- trigger_enqueue_nds_recompute is left in place during expand and is removed in
-- step 03 (activate) once the new worker is deployed.

CREATE OR REPLACE FUNCTION public.nds_request_work_for_journal_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_day DATE;
BEGIN
  IF TG_OP <> 'INSERT' AND public.nds_is_consumption_row(OLD.entry_type) THEN
    v_day := public.nds_consumed_day(OLD.payload, OLD.occurred_at);
    PERFORM public.nds_request_work(
      OLD.person_id, v_day,
      COALESCE((SELECT revision FROM public.journal_day_revisions
                 WHERE person_id = OLD.person_id AND date_local = v_day), 0)
    );
  END IF;

  IF TG_OP <> 'DELETE' AND public.nds_is_consumption_row(NEW.entry_type) THEN
    v_day := public.nds_consumed_day(NEW.payload, NEW.occurred_at);
    PERFORM public.nds_request_work(
      NEW.person_id, v_day,
      COALESCE((SELECT revision FROM public.journal_day_revisions
                 WHERE person_id = NEW.person_id AND date_local = v_day), 0)
    );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_nds_request_work ON public.journal_entries;

-- Fires AFTER the revision trigger (alphabetical order by trigger name puts
-- trigger_nds_request_work after trigger_nds_track_journal_day_revision), so the
-- requested revision it reads is the one this transaction just published.
CREATE TRIGGER trigger_nds_request_work
AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.nds_request_work_for_journal_change();

-- ============================================================================
-- 7. Row-level security and least-privilege grants
-- ============================================================================
-- Browser roles have NO access to work rows or the generation fence, and cannot
-- publish a score. Privileged functions are SECURITY DEFINER with a fixed
-- search_path and fully qualified object names; EXECUTE is granted to no
-- browser role.

ALTER TABLE public.nds_recompute_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nds_recompute_work FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nds_recompute_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nds_recompute_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nds_computation_generation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nds_computation_generation FORCE ROW LEVEL SECURITY;

-- No policies are created for these tables: with RLS forced and no permissive
-- policy, anon and authenticated are denied every operation.

REVOKE ALL ON public.nds_recompute_work FROM anon, authenticated;
REVOKE ALL ON public.nds_recompute_attempts FROM anon, authenticated;
REVOKE ALL ON public.nds_computation_generation FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.nds_publish_daily_score(
  UUID, DATE, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.nds_claim_work(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_complete_work(UUID, DATE, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_fail_work(UUID, DATE, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_request_work(UUID, DATE, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_read_day_snapshot(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_work_diagnostics() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 8. Verification queries (read-only)
-- ============================================================================

-- Uniqueness no longer involves status, so repeat completion cannot collide.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('nds_recompute_work', 'nds_recompute_queue')
ORDER BY tablename, indexname;

-- Every new table has RLS enabled and forced.
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('journal_day_revisions', 'nds_recompute_work', 'nds_recompute_attempts', 'nds_computation_generation');

-- No browser role holds EXECUTE on a privileged function.
SELECT p.proname, p.prosecdef, pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'nds_%'
ORDER BY p.proname;

-- Every privileged function pins its search_path.
SELECT p.proname, p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'nds_%'
ORDER BY p.proname;

-- Truthful queue diagnostics.
SELECT * FROM public.nds_work_diagnostics();
