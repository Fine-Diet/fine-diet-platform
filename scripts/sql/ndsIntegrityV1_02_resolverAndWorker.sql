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

ALTER TABLE public.daily_nds
  ADD COLUMN IF NOT EXISTS scored_entry_count INTEGER,
  ADD COLUMN IF NOT EXISTS unscorable_entry_count INTEGER,
  ADD COLUMN IF NOT EXISTS limitations JSONB;

COMMENT ON COLUMN public.daily_nds.limitations IS
  'User-relevant qualifications for this result. Persisted because a cache hit must reconstruct the SAME public contract, not reset counts and limitations to empty.';

-- ---------------------------------------------------------------------------
-- A non-numeric day must be storable without inventing a number
-- ---------------------------------------------------------------------------
-- The original table declared the score and all seven subscores NOT NULL. That
-- is the storage-level reason an `empty` or `insufficient_data` day could only be
-- written by supplying 0, and why a cache hit had to invent a value back. The
-- columns become nullable and a state-conditional constraint enforces the real
-- contract instead: a `fresh` row must carry a complete numeric result, and a
-- non-numeric state must carry none at all.

ALTER TABLE public.daily_nds
  ALTER COLUMN nds_score_100 DROP NOT NULL,
  ALTER COLUMN wfr_10 DROP NOT NULL,
  ALTER COLUMN ps_10  DROP NOT NULL,
  ALTER COLUMN pnd_10 DROP NOT NULL,
  ALTER COLUMN fp_10  DROP NOT NULL,
  ALTER COLUMN as_10  DROP NOT NULL,
  ALTER COLUMN mnc_10 DROP NOT NULL,
  ALTER COLUMN ob_10  DROP NOT NULL;

ALTER TABLE public.daily_nds DROP CONSTRAINT IF EXISTS daily_nds_state_numeric_contract;
ALTER TABLE public.daily_nds ADD CONSTRAINT daily_nds_state_numeric_contract CHECK (
  CASE
    -- Pre-contract rows carry no response_state. They are never served as fresh
    -- (the resolver rejects a NULL source_revision), so they are left alone
    -- rather than rewritten by this migration.
    WHEN response_state IS NULL THEN TRUE
    WHEN response_state = 'fresh' THEN
      nds_score_100 IS NOT NULL
      AND wfr_10 IS NOT NULL AND ps_10 IS NOT NULL AND pnd_10 IS NOT NULL
      AND fp_10 IS NOT NULL AND as_10 IS NOT NULL AND mnc_10 IS NOT NULL
      AND ob_10 IS NOT NULL
    WHEN response_state IN ('empty', 'insufficient_data') THEN
      nds_score_100 IS NULL
      AND wfr_10 IS NULL AND ps_10 IS NULL AND pnd_10 IS NULL
      AND fp_10 IS NULL AND as_10 IS NULL AND mnc_10 IS NULL AND ob_10 IS NULL
    ELSE FALSE
  END
);

COMMENT ON CONSTRAINT daily_nds_state_numeric_contract ON public.daily_nds IS
  'A fresh row must be numerically complete; empty and insufficient_data rows must hold no numbers. Prevents both a zero-filled fresh row and a fabricated score for a day that has none.';

-- ---------------------------------------------------------------------------
-- Legacy direct-writer fence
-- ---------------------------------------------------------------------------
-- A deprecation comment in TypeScript cannot stop an already-running old
-- deployment, and new metadata columns do not stop it from changing the numeric
-- columns while leaving newer validity metadata in place. The database therefore
-- refuses any write to an authoritative v1 row that did not come through
-- nds_publish_daily_score, which announces itself with a transaction-local flag.
--
-- The flag is set with is_local => true, so it cannot leak past the publishing
-- transaction, and it cannot be forged by a browser role: those roles have no
-- privileges on this table at all.

CREATE OR REPLACE FUNCTION public.nds_guard_daily_nds_writer()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF current_setting('nds.publishing', TRUE) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Rows that predate the contract stay writable so a legacy backfill or an
  -- operator repair is not bricked by this fence.
  IF TG_OP = 'UPDATE' AND OLD.source_revision IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'daily_nds is authoritative for NDS v1: writes must go through nds_publish_daily_score (legacy direct writer refused)'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trigger_nds_guard_daily_nds_writer ON public.daily_nds;
CREATE TRIGGER trigger_nds_guard_daily_nds_writer
BEFORE INSERT OR UPDATE ON public.daily_nds
FOR EACH ROW
EXECUTE FUNCTION public.nds_guard_daily_nds_writer();

COMMENT ON FUNCTION public.nds_guard_daily_nds_writer() IS
  'Refuses writes to authoritative v1 daily_nds rows unless they arrive through nds_publish_daily_score. Fences a still-running old deployment during rollout and rollback.';

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

-- The generation is seeded WITH the context it denotes. An integer alone is not
-- a fence: an old build can read the new number and send it alongside its own
-- older formula identity, which is exactly what the review found. Publication
-- therefore compares the writer's whole version tuple against these columns, so
-- the number cannot be borrowed.
--
-- These literals must match lib/nds/types.ts, lib/nds/consumedInputs/types.ts
-- and lib/nds/dayIdentity.ts. nds_assert_generation_matches_source() below fails
-- loudly if they drift.
INSERT INTO public.nds_computation_generation (
  id, generation, nds_version, classifier_version, normalizer_version, day_policy_version
)
VALUES (
  TRUE, 1,
  'nds_daily_2026-01-26.v10',
  'processing_classifier_2026-02-08.v2',
  'nds_consumed_normalizer_2026-09-13.v2',
  'nds_day_policy_2026-09-13.v2'
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.nds_computation_generation
  ALTER COLUMN nds_version SET NOT NULL,
  ALTER COLUMN classifier_version SET NOT NULL,
  ALTER COLUMN normalizer_version SET NOT NULL,
  ALTER COLUMN day_policy_version SET NOT NULL;

COMMENT ON TABLE public.nds_computation_generation IS
  'Single-row fence naming the computation generation permitted to publish scores AND the version tuple that generation means. Publication requires both, so an older deployment cannot adopt the new integer.';

CREATE OR REPLACE FUNCTION public.nds_active_generation()
RETURNS BIGINT
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT generation FROM public.nds_computation_generation WHERE id;
$$;

-- ---------------------------------------------------------------------------
-- Advance the generation together with its context
-- ---------------------------------------------------------------------------
-- Deployment order matters: bumping the integer without recording the new
-- context would lock every writer out, and recording a context without bumping
-- would let the previous build keep publishing. One function does both.

CREATE OR REPLACE FUNCTION public.nds_advance_generation(
  p_nds_version        TEXT,
  p_classifier_version TEXT,
  p_normalizer_version TEXT,
  p_day_policy_version TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_generation BIGINT;
BEGIN
  UPDATE public.nds_computation_generation
     SET generation         = generation + 1,
         nds_version        = p_nds_version,
         classifier_version = p_classifier_version,
         normalizer_version = p_normalizer_version,
         day_policy_version = p_day_policy_version,
         updated_at         = NOW()
   WHERE id
  RETURNING generation INTO v_generation;

  RETURN v_generation;
END;
$$;

COMMENT ON FUNCTION public.nds_advance_generation(TEXT, TEXT, TEXT, TEXT) IS
  'Atomically advance the computation generation and record the version tuple it denotes. Run during deployment of a changed computation context, before the new build serves traffic.';

-- ============================================================================
-- 3. Consistent snapshot read
-- ============================================================================
-- Returns the day's source revision, the active generation, and the cached row's
-- validity metadata in ONE statement. At READ COMMITTED, two sequential SELECTs
-- may see two different snapshots
-- (https://www.postgresql.org/docs/current/transaction-iso.html), so the
-- resolver must not assemble this from separate round trips.

-- The return type gains the persisted coverage columns, and PostgreSQL will not
-- replace a set-returning function's row type in place.
DROP FUNCTION IF EXISTS public.nds_read_day_snapshot(UUID, DATE);

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
  -- Subscores are returned alongside the score so an ordinary read never needs a
  -- second query, and so a partially readable cache row can be rejected wholesale
  -- rather than serving some subscores as zero.
  wfr_10 NUMERIC, ps_10 NUMERIC, pnd_10 NUMERIC, fp_10 NUMERIC,
  as_10 NUMERIC, mnc_10 NUMERIC, ob_10 NUMERIC,
  cached_readings         JSONB,
  cached_added_sugar_coverage TEXT,
  cached_day_provenance   TEXT,
  cached_scored_entry_count INTEGER,
  cached_unscorable_entry_count INTEGER,
  cached_limitations      JSONB,
  cached_computed_as_of   TIMESTAMPTZ,
  debug_data              JSONB,
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
    d.wfr_10, d.ps_10, d.pnd_10, d.fp_10, d.as_10, d.mnc_10, d.ob_10,
    d.readings                             AS cached_readings,
    d.added_sugar_coverage                 AS cached_added_sugar_coverage,
    d.day_provenance                       AS cached_day_provenance,
    d.scored_entry_count                   AS cached_scored_entry_count,
    d.unscorable_entry_count               AS cached_unscorable_entry_count,
    d.limitations                          AS cached_limitations,
    d.computed_as_of                       AS cached_computed_as_of,
    d.debug_data                           AS debug_data,
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
--
-- The reviewed signature is dropped rather than replaced: adding parameters with
-- defaults would leave BOTH signatures resolvable, so a caller compiled against
-- the old one would keep publishing without the coverage fields and, worse, some
-- calls would be ambiguous. Retiring the signature makes stale callers fail
-- loudly at call time instead of silently taking the old path.
DROP FUNCTION IF EXISTS public.nds_publish_daily_score(
  UUID, DATE, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, JSONB);

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
  p_debug_data             JSONB,
  p_scored_entry_count     INTEGER DEFAULT NULL,
  p_unscorable_entry_count INTEGER DEFAULT NULL,
  p_limitations            JSONB DEFAULT NULL
)
RETURNS TABLE (published BOOLEAN, reason TEXT, current_revision BIGINT, current_generation BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current_revision   BIGINT;
  v_active_generation  BIGINT;
  v_gen_nds            TEXT;
  v_gen_classifier     TEXT;
  v_gen_normalizer     TEXT;
  v_gen_day_policy     TEXT;
  v_existing_revision  BIGINT;
  v_existing_generation BIGINT;
  v_written            INTEGER;
BEGIN
  -- Transaction-local: identifies this function as the authorised writer to the
  -- daily_nds fence, and cannot outlive the transaction.
  PERFORM set_config('nds.publishing', 'on', TRUE);

  -- A guard row must EXIST before it can be locked. The reviewed version took
  -- FOR SHARE on a possibly-absent row, which locks nothing, so two initial
  -- publishes for a legacy or not-yet-mutated day could race past the guard.
  --
  -- Revision 0 is inserted when absent. That is a guard, not a change: 0 means
  -- "no committed mutation yet", and the first real mutation bumps it to 1
  -- exactly as it would have without this row. A read must never advance the
  -- source revision.
  INSERT INTO public.journal_day_revisions (person_id, date_local, revision, last_change_kind)
  VALUES (p_person_id, p_date_local, 0, 'insert')
  ON CONFLICT (person_id, date_local) DO NOTHING;

  -- FOR UPDATE, not FOR SHARE: two concurrent publishes for the same day must
  -- serialise against each other, not merely against an invalidation.
  SELECT r.revision INTO v_current_revision
  FROM public.journal_day_revisions r
  WHERE r.person_id = p_person_id AND r.date_local = p_date_local
  FOR UPDATE;

  v_current_revision := COALESCE(v_current_revision, 0);

  -- Locked for the remainder of the transaction so the context cannot change
  -- between validation and the write.
  SELECT generation, nds_version, classifier_version, normalizer_version, day_policy_version
    INTO v_active_generation, v_gen_nds, v_gen_classifier, v_gen_normalizer, v_gen_day_policy
  FROM public.nds_computation_generation
  WHERE id
  FOR SHARE;

  IF p_generation IS DISTINCT FROM v_active_generation THEN
    RETURN QUERY SELECT FALSE, 'stale_generation', v_current_revision, v_active_generation;
    RETURN;
  END IF;

  -- The integer must be accompanied by the context it denotes. This is what
  -- stops an old build from reading the new generation and publishing old
  -- semantics under it.
  IF p_nds_version        IS DISTINCT FROM v_gen_nds
     OR p_classifier_version IS DISTINCT FROM v_gen_classifier
     OR p_normalizer_version IS DISTINCT FROM v_gen_normalizer
     OR p_day_policy_version IS DISTINCT FROM v_gen_day_policy THEN
    RETURN QUERY SELECT FALSE, 'stale_context', v_current_revision, v_active_generation;
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
    readings, debug_data, computed_as_of, updated_at,
    scored_entry_count, unscorable_entry_count, limitations
  )
  VALUES (
    p_person_id, p_date_local,
    p_score_100, p_wfr_10, p_ps_10, p_pnd_10, p_fp_10, p_as_10, p_mnc_10, p_ob_10,
    p_nds_version, p_classifier_version,
    p_normalizer_version, p_day_policy_version, p_dependency_fingerprint,
    p_computed_from_revision, p_generation,
    p_response_state, p_day_provenance, p_added_sugar_coverage,
    p_readings, p_debug_data, NOW(), NOW(),
    p_scored_entry_count, p_unscorable_entry_count, p_limitations
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
        updated_at = NOW(),
        scored_entry_count = EXCLUDED.scored_entry_count,
        unscorable_entry_count = EXCLUDED.unscorable_entry_count,
        limitations = EXCLUDED.limitations
    -- Generation belongs in the predicate too: at one source revision, a newer
    -- computation context must not be overwritten by an older one.
    WHERE (d.source_revision IS NULL OR d.source_revision <= EXCLUDED.source_revision)
      AND (d.computation_generation IS NULL
           OR d.computation_generation <= EXCLUDED.computation_generation);

  -- Report what the write actually did. A conditional upsert that matches no row
  -- affects zero rows and must not be reported as a successful publish.
  GET DIAGNOSTICS v_written = ROW_COUNT;
  IF v_written = 0 THEN
    RETURN QUERY SELECT FALSE, 'newer_result_present', v_current_revision, v_active_generation;
    RETURN;
  END IF;

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
  -- Generation the request was raised under, and the generation actually
  -- completed. Both are required: a changed computation context at an UNCHANGED
  -- source revision is real outstanding work, and tracking only the request side
  -- silently loses it.
  requested_generation BIGINT NOT NULL DEFAULT 1,
  processed_generation BIGINT NOT NULL DEFAULT -1,

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
  'Coalescing per-person/day recompute work with revision and generation fencing. Outstanding work is defined once, by nds_work_is_outstanding; there is no status column to collide on.';

-- Applied for a cluster that already has the table from an earlier expand run.
ALTER TABLE public.nds_recompute_work
  ADD COLUMN IF NOT EXISTS processed_generation BIGINT NOT NULL DEFAULT -1;

-- The one definition of outstanding work, used by claiming, diagnostics and
-- tests alike so they cannot disagree.
CREATE OR REPLACE FUNCTION public.nds_work_is_outstanding(
  p_requested_revision  BIGINT,
  p_processed_revision  BIGINT,
  p_requested_generation BIGINT,
  p_processed_generation BIGINT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT p_requested_revision > p_processed_revision
      OR p_requested_generation > p_processed_generation;
$$;

-- Claimable work: outstanding, past its backoff, and not under a live lease.
CREATE INDEX IF NOT EXISTS idx_nds_work_claimable
ON public.nds_recompute_work (not_before)
WHERE requested_revision > processed_revision OR requested_generation > processed_generation;

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
DECLARE
  -- A short delay coalesces a burst of edits into one recompute. It was a
  -- hard-coded 5 seconds, which made the debounce untestable and unadjustable:
  -- nothing could observe worker behaviour without waiting out the window, and an
  -- operator could not shorten it during a backlog. It is now a setting, with the
  -- same default.
  v_debounce_ms INTEGER := COALESCE(
    NULLIF(current_setting('nds.request_debounce_ms', TRUE), '')::INTEGER,
    5000
  );
BEGIN
  INSERT INTO public.nds_recompute_work AS w (
    person_id, date_local, requested_revision, requested_generation, not_before, last_requested_at
  )
  VALUES (
    p_person_id, p_date_local, p_revision, public.nds_active_generation(),
    NOW() + (v_debounce_ms * INTERVAL '1 millisecond'), NOW()
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
    WHERE public.nds_work_is_outstanding(
            w.requested_revision, w.processed_revision,
            w.requested_generation, w.processed_generation)
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

-- Retired for the same reason as the publish signature: a completion that cannot
-- state which generation it verified must not remain callable.
DROP FUNCTION IF EXISTS public.nds_complete_work(UUID, DATE, UUID, BIGINT);

CREATE OR REPLACE FUNCTION public.nds_complete_work(
  p_person_id  UUID,
  p_date_local DATE,
  p_lease_token UUID,
  p_processed_revision BIGINT,
  p_processed_generation BIGINT
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
    RETURN QUERY SELECT FALSE, 'lease_not_held', public.nds_work_is_outstanding(
      v_row.requested_revision, v_row.processed_revision,
      v_row.requested_generation, v_row.processed_generation);
    RETURN;
  END IF;

  IF v_row.lease_expires_at IS NOT NULL AND v_row.lease_expires_at <= NOW() THEN
    INSERT INTO public.nds_recompute_attempts (person_id, date_local, lease_token, requested_revision, outcome, detail)
    VALUES (p_person_id, p_date_local, p_lease_token, v_row.requested_revision, 'lease_expired',
            'completion arrived after the lease expired');
    RETURN QUERY SELECT FALSE, 'lease_expired', public.nds_work_is_outstanding(
      v_row.requested_revision, v_row.processed_revision,
      v_row.requested_generation, v_row.processed_generation);
    RETURN;
  END IF;

  -- Only the identity actually verified is recorded. A request that arrived
  -- while this worker was running raised requested_revision or
  -- requested_generation, so the item correctly REMAINS outstanding afterwards.
  UPDATE public.nds_recompute_work
     SET processed_revision   = GREATEST(processed_revision, p_processed_revision),
         processed_generation = GREATEST(processed_generation, p_processed_generation),
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
  SELECT TRUE, 'completed', public.nds_work_is_outstanding(
    w.requested_revision, w.processed_revision,
    w.requested_generation, w.processed_generation)
  FROM public.nds_recompute_work w
  WHERE w.person_id = p_person_id AND w.date_local = p_date_local;
END;
$$;

COMMENT ON FUNCTION public.nds_complete_work(UUID, DATE, UUID, BIGINT, BIGINT) IS
  'Fenced completion. Requires the live lease token and records only the revision AND generation actually verified, so newer work stays outstanding.';

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
    COUNT(*) FILTER (WHERE public.nds_work_is_outstanding(
      requested_revision, processed_revision, requested_generation, processed_generation)),
    COUNT(*) FILTER (WHERE lease_token IS NOT NULL AND lease_expires_at > NOW()),
    COUNT(*) FILTER (WHERE lease_token IS NOT NULL AND lease_expires_at <= NOW()),
    COUNT(*) FILTER (WHERE last_error IS NOT NULL AND public.nds_work_is_outstanding(
      requested_revision, processed_revision, requested_generation, processed_generation)),
    MAX(NOW() - first_requested_at) FILTER (WHERE public.nds_work_is_outstanding(
      requested_revision, processed_revision, requested_generation, processed_generation))
  FROM public.nds_recompute_work;
$$;

-- ============================================================================
-- 6. Trigger: raise work alongside the revision bump
-- ============================================================================
-- Replaces the legacy enqueue for the new table. The legacy
-- trigger_enqueue_nds_recompute is left in place during expand and is removed in
-- step 03 (activate) once the new worker is deployed.

-- There is deliberately NO second trigger.
--
-- The reviewed version added trigger_nds_request_work and relied on a comment
-- asserting that alphabetical ordering ran it after
-- trigger_nds_track_journal_day_revision. PostgreSQL does order same-kind
-- triggers by name, but 'request' sorts BEFORE 'track', so the work trigger read
-- the pre-mutation revision. A day whose previous work had already been
-- processed at revision R could then request R again and never become
-- outstanding, and the worker could not be relied on to find the edit.
--
-- Instead, the single revision trigger from step 01 calls this hook with the
-- revision its own bump returned. Ordering is no longer a property of trigger
-- names, so it cannot silently reverse again.

CREATE OR REPLACE FUNCTION public.nds_after_day_revision_bump(
  p_person_id  UUID,
  p_date_local DATE,
  p_revision   BIGINT,
  p_change_kind TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_person_id IS NULL OR p_date_local IS NULL OR p_revision IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.nds_request_work(p_person_id, p_date_local, p_revision);
END;
$$;

COMMENT ON FUNCTION public.nds_after_day_revision_bump(UUID, DATE, BIGINT, TEXT) IS
  'Requests recompute work at the revision the invalidating bump returned, inside the same transaction and the same trigger. Replaces the ordering-dependent second trigger.';

-- Removed if an earlier expand run created it.
DROP TRIGGER IF EXISTS trigger_nds_request_work ON public.journal_entries;
DROP FUNCTION IF EXISTS public.nds_request_work_for_journal_change();

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
GRANT SELECT ON public.nds_computation_generation TO service_role;

REVOKE ALL ON FUNCTION public.nds_publish_daily_score(
  UUID, DATE, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, JSONB,
  INTEGER, INTEGER, JSONB
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.nds_after_day_revision_bump(UUID, DATE, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.nds_claim_work(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_complete_work(UUID, DATE, UUID, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_fail_work(UUID, DATE, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_request_work(UUID, DATE, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_read_day_snapshot(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_work_diagnostics() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nds_advance_generation(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.nds_active_generation() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nds_operator') THEN
    CREATE ROLE nds_operator NOLOGIN NOINHERIT;
  END IF;
END
$$;

-- Ordinary server authority may resolve, publish, and process work.
GRANT EXECUTE ON FUNCTION public.nds_publish_daily_score(
  UUID, DATE, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, JSONB,
  INTEGER, INTEGER, JSONB
) TO service_role;
GRANT EXECUTE ON FUNCTION public.nds_after_day_revision_bump(UUID, DATE, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.nds_claim_work(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.nds_complete_work(UUID, DATE, UUID, BIGINT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.nds_fail_work(UUID, DATE, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.nds_request_work(UUID, DATE, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.nds_read_day_snapshot(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.nds_work_diagnostics() TO service_role;
GRANT EXECUTE ON FUNCTION public.nds_active_generation() TO service_role;

-- Only the declared operator authority may change global computation context.
GRANT USAGE ON SCHEMA public TO nds_operator;
GRANT EXECUTE ON FUNCTION public.nds_advance_generation(TEXT, TEXT, TEXT, TEXT) TO nds_operator;

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
