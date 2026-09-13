-- ============================================================================
-- NDS Integrity v1 — Step 01: Canonical consumed day + transactional source revisions
-- ============================================================================
--
-- Packet: FD-PLATFORM-NDS-01 (checkpoint B). EXPAND phase — additive only.
--
-- LOCAL APPLICATION ONLY. This file has NOT been applied to any database by the
-- packet that produced it. Remote DDL, including staging, is a separate approval
-- gate. See docs/nds/NDS-01-MIGRATION-ACTIVATION.md for the activation and
-- rollback order.
--
-- What this step adds:
--   1. public.nds_consumed_day(payload, occurred_at) — the ONE day-membership
--      rule, mirroring lib/nds/dayIdentity.ts exactly.
--   2. public.journal_day_revisions — a monotonically increasing revision per
--      (person_id, date_local).
--   3. A trigger that advances those revisions in the SAME TRANSACTION as the
--      committed journal mutation, covering every writer including batched
--      inserts and direct SQL.
--   4. Row-level security and least-privilege grants: no browser role may set a
--      revision.
--
-- What this step deliberately does NOT do:
--   - It does not touch existing journal rows.
--   - It does not backfill historical revisions or timezone metadata.
--   - It does not remove the legacy nds_recompute_queue trigger. Both run side
--    by side during expand; step 02 fences the legacy writer.
-- ============================================================================

-- ============================================================================
-- 1. Canonical consumed-day membership
-- ============================================================================
-- Explicit server-authored metadata wins. Anything absent, malformed, or
-- internally inconsistent falls back to the DETERMINISTIC UTC COMPATIBILITY
-- BUCKET, which is what Log selection has always used. The bucket is not a
-- claim about the original local day, and nothing here rewrites history.

CREATE OR REPLACE FUNCTION public.nds_consumed_day(
  p_payload JSONB,
  p_occurred_at TIMESTAMPTZ
)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_day            JSONB;
  v_date_text      TEXT;
  v_zone_text      TEXT;
  v_instant_text   TEXT;
  v_claimed_date   DATE;
  v_parsed_instant TIMESTAMPTZ;
  v_derived_date   DATE;
BEGIN
  -- Fallback bucket, used for every rejection path below.
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN (p_occurred_at AT TIME ZONE 'UTC')::DATE;
  END IF;

  v_day := p_payload -> 'consumed_day';
  IF v_day IS NULL OR jsonb_typeof(v_day) <> 'object' THEN
    RETURN (p_occurred_at AT TIME ZONE 'UTC')::DATE;
  END IF;

  v_date_text    := v_day ->> 'date_local';
  v_zone_text    := v_day ->> 'time_zone';
  v_instant_text := v_day ->> 'utc_instant';

  IF v_date_text IS NULL OR v_zone_text IS NULL OR v_instant_text IS NULL THEN
    RETURN (p_occurred_at AT TIME ZONE 'UTC')::DATE;
  END IF;

  -- A bare numeric offset cannot carry daylight-saving rules, so it cannot
  -- determine a correct local day. Require an IANA-style identifier.
  IF v_zone_text <> 'UTC' AND v_zone_text NOT LIKE '%/%' THEN
    RETURN (p_occurred_at AT TIME ZONE 'UTC')::DATE;
  END IF;

  -- Impossible dates and unknown zones raise rather than silently coercing.
  BEGIN
    v_claimed_date   := v_date_text::DATE;
    v_parsed_instant := v_instant_text::TIMESTAMPTZ;
    v_derived_date   := (v_parsed_instant AT TIME ZONE v_zone_text)::DATE;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN (p_occurred_at AT TIME ZONE 'UTC')::DATE;
  END;

  -- The claimed date must be the date the zone and instant actually produce.
  IF v_derived_date IS DISTINCT FROM v_claimed_date THEN
    RETURN (p_occurred_at AT TIME ZONE 'UTC')::DATE;
  END IF;

  RETURN v_claimed_date;
END;
$$;

COMMENT ON FUNCTION public.nds_consumed_day(JSONB, TIMESTAMPTZ) IS
  'Canonical consumed-day membership. Mirrors lib/nds/dayIdentity.ts: validated payload.consumed_day metadata wins, otherwise the labelled UTC compatibility bucket. Never rewrites history.';

-- True when a journal row is relevant to actual consumption scoring.
CREATE OR REPLACE FUNCTION public.nds_is_consumption_row(p_entry_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT p_entry_type = 'intake';
$$;

-- ============================================================================
-- 1b. Subject-owned timezone preference
-- ============================================================================
-- The consumed day belongs to the SUBJECT, not to whoever is looking at the
-- screen. Storing the zone on the person is what lets a coach view or write a
-- client's journal without a delegate's machine timezone defining the client's
-- day. Nullable and unset: a NULL zone means the write boundary leaves
-- consumed_day absent and reads use the UTC compatibility bucket, which is the
-- current behaviour. No value is inferred or backfilled here.

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS consumed_time_zone TEXT;

COMMENT ON COLUMN public.people.consumed_time_zone IS
  'Subject-owned IANA timezone used to author consumed_day on their intake entries. NULL means unknown: entries are written without day metadata and read through the UTC compatibility bucket.';

-- ============================================================================
-- 2. Per-person/day source revision
-- ============================================================================
-- One row per (person_id, date_local). The row is RETAINED when the last food
-- of a day is deleted, so an empty day keeps a tombstone revision that still
-- invalidates a cached score.

CREATE TABLE IF NOT EXISTS public.journal_day_revisions (
  person_id  UUID   NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  date_local DATE   NOT NULL,

  -- Monotonically increasing. Advanced only by the trigger below, inside the
  -- same transaction as the journal mutation, so a rolled-back write cannot
  -- publish an advanced revision. A sequence would NOT satisfy this: sequence
  -- advances are not transactional.
  revision   BIGINT NOT NULL DEFAULT 1,

  -- Diagnostics only. Never a correctness mechanism.
  last_change_kind TEXT NOT NULL DEFAULT 'insert'
    CHECK (last_change_kind IN ('insert', 'update', 'delete', 'move_out', 'move_in', 'type_transition')),
  last_change_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (person_id, date_local)
);

COMMENT ON TABLE public.journal_day_revisions IS
  'Monotonic per-person/day source revision for actual consumption. Advanced transactionally with journal_entries mutations. A retained row with no entries is an intentional tombstone.';

COMMENT ON COLUMN public.journal_day_revisions.revision IS
  'Monotonic counter. A cached score is current only when its stored source_revision equals this value (plus all version fields matching).';

CREATE INDEX IF NOT EXISTS idx_journal_day_revisions_changed
ON public.journal_day_revisions (last_change_at DESC);

-- ============================================================================
-- 3. Transactional bump helper
-- ============================================================================
-- ON CONFLICT DO UPDATE takes the row lock, so concurrent writers to the same
-- person/day serialize and every commit produces a distinct, increasing value.

CREATE OR REPLACE FUNCTION public.nds_bump_day_revision(
  p_person_id  UUID,
  p_date_local DATE,
  p_change_kind TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_revision BIGINT;
BEGIN
  IF p_person_id IS NULL OR p_date_local IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.journal_day_revisions AS r (person_id, date_local, revision, last_change_kind, last_change_at)
  VALUES (p_person_id, p_date_local, 1, p_change_kind, NOW())
  ON CONFLICT (person_id, date_local) DO UPDATE
    SET revision         = r.revision + 1,
        last_change_kind = EXCLUDED.last_change_kind,
        last_change_at   = NOW()
  RETURNING r.revision INTO v_revision;

  RETURN v_revision;
END;
$$;

COMMENT ON FUNCTION public.nds_bump_day_revision(UUID, DATE, TEXT) IS
  'Advance a per-person/day source revision inside the caller transaction. SECURITY DEFINER so the trigger works for every writer; EXECUTE is granted to no browser role.';

-- ============================================================================
-- 4. Trigger over every journal writer
-- ============================================================================
-- Covers single inserts, batched multi-row inserts, updates, deletes,
-- intake/non-intake transitions, and movement between dates. A cross-date move
-- invalidates BOTH days. Days are bumped in ascending date order so operations
-- touching two days always take row locks in the same order.

CREATE OR REPLACE FUNCTION public.nds_track_journal_day_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_old_relevant BOOLEAN := FALSE;
  v_new_relevant BOOLEAN := FALSE;
  v_old_person   UUID;
  v_new_person   UUID;
  v_old_day      DATE;
  v_new_day      DATE;
  v_change_kind  TEXT;
  v_relevant_change BOOLEAN;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_relevant := public.nds_is_consumption_row(OLD.entry_type);
    IF v_old_relevant THEN
      v_old_person := OLD.person_id;
      v_old_day    := public.nds_consumed_day(OLD.payload, OLD.occurred_at);
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new_relevant := public.nds_is_consumption_row(NEW.entry_type);
    IF v_new_relevant THEN
      v_new_person := NEW.person_id;
      v_new_day    := public.nds_consumed_day(NEW.payload, NEW.occurred_at);
    END IF;
  END IF;

  -- Nothing consumption-related on either side: unrelated journal domains must
  -- not trigger scoring recomputation.
  IF NOT v_old_relevant AND NOT v_new_relevant THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Over-invalidating the same person's affected day is safer than missing a
    -- relevant change, so any NDS-relevant column counts.
    v_relevant_change :=
      OLD.entry_type       IS DISTINCT FROM NEW.entry_type
      OR OLD.person_id     IS DISTINCT FROM NEW.person_id
      OR OLD.occurred_at   IS DISTINCT FROM NEW.occurred_at
      OR OLD.payload       IS DISTINCT FROM NEW.payload
      OR OLD.quantity_g    IS DISTINCT FROM NEW.quantity_g
      OR OLD.protein_score_10   IS DISTINCT FROM NEW.protein_score_10
      OR OLD.is_main_meal       IS DISTINCT FROM NEW.is_main_meal
      OR OLD.meal_derived_data  IS DISTINCT FROM NEW.meal_derived_data;

    IF NOT v_relevant_change THEN
      RETURN NULL;
    END IF;
  END IF;

  v_change_kind := CASE
    WHEN TG_OP = 'INSERT' THEN 'insert'
    WHEN TG_OP = 'DELETE' THEN 'delete'
    WHEN v_old_relevant <> v_new_relevant THEN 'type_transition'
    ELSE 'update'
  END;

  -- Single affected day.
  IF v_old_person IS NOT DISTINCT FROM v_new_person
     AND v_old_day IS NOT DISTINCT FROM v_new_day THEN
    PERFORM public.nds_bump_day_revision(
      COALESCE(v_new_person, v_old_person),
      COALESCE(v_new_day, v_old_day),
      v_change_kind
    );
    RETURN NULL;
  END IF;

  -- Two affected identities (a move across dates, or between people). Bump in
  -- ascending (person, date) order to keep a single global lock ordering.
  IF v_old_person IS NOT NULL AND v_new_person IS NOT NULL THEN
    IF (v_old_person, v_old_day) <= (v_new_person, v_new_day) THEN
      PERFORM public.nds_bump_day_revision(v_old_person, v_old_day, 'move_out');
      PERFORM public.nds_bump_day_revision(v_new_person, v_new_day, 'move_in');
    ELSE
      PERFORM public.nds_bump_day_revision(v_new_person, v_new_day, 'move_in');
      PERFORM public.nds_bump_day_revision(v_old_person, v_old_day, 'move_out');
    END IF;
    RETURN NULL;
  END IF;

  IF v_old_person IS NOT NULL THEN
    PERFORM public.nds_bump_day_revision(v_old_person, v_old_day, 'move_out');
  END IF;
  IF v_new_person IS NOT NULL THEN
    PERFORM public.nds_bump_day_revision(v_new_person, v_new_day, 'move_in');
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.nds_track_journal_day_revision() IS
  'AFTER trigger advancing per-person/day source revisions in the same transaction as the journal mutation. Invalidates both days on a cross-date move; retains a tombstone revision for an emptied day.';

DROP TRIGGER IF EXISTS trigger_nds_track_journal_day_revision ON public.journal_entries;

-- AFTER ... FOR EACH ROW, NOT DEFERRABLE: the bump commits with the mutation and
-- rolls back with it.
CREATE TRIGGER trigger_nds_track_journal_day_revision
AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION public.nds_track_journal_day_revision();

-- ============================================================================
-- 5. Row-level security and least-privilege grants
-- ============================================================================
-- Browser roles may READ their own revisions (useful for diagnostics) and may
-- never write one. Only the trigger, running SECURITY DEFINER as the owner, and
-- the server-side service role can advance a revision.

ALTER TABLE public.journal_day_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_day_revisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS journal_day_revisions_select_self ON public.journal_day_revisions;
CREATE POLICY journal_day_revisions_select_self
ON public.journal_day_revisions
FOR SELECT
TO authenticated
USING (
  person_id IN (
    SELECT p.id FROM public.people p WHERE p.auth_user_id = auth.uid()
  )
);

-- No INSERT / UPDATE / DELETE policy exists for authenticated or anon. With RLS
-- forced and no permissive policy, those writes are denied outright.

REVOKE ALL ON public.journal_day_revisions FROM anon;
REVOKE ALL ON public.journal_day_revisions FROM authenticated;
GRANT SELECT ON public.journal_day_revisions TO authenticated;

REVOKE ALL ON FUNCTION public.nds_bump_day_revision(UUID, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.nds_bump_day_revision(UUID, DATE, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.nds_bump_day_revision(UUID, DATE, TEXT) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.nds_consumed_day(JSONB, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.nds_is_consumption_row(TEXT) TO authenticated;

-- ============================================================================
-- 6. Verification queries (read-only)
-- ============================================================================

-- Membership function agrees with the TypeScript helper on both paths.
SELECT
  public.nds_consumed_day(
    '{"consumed_day":{"date_local":"2026-09-12","time_zone":"America/Chicago","utc_instant":"2026-09-13T02:30:00.000Z"}}'::JSONB,
    '2026-09-13T02:30:00Z'::TIMESTAMPTZ
  ) AS explicit_expect_2026_09_12,
  public.nds_consumed_day('{}'::JSONB, '2026-09-13T02:30:00Z'::TIMESTAMPTZ)
    AS legacy_bucket_expect_2026_09_13,
  public.nds_consumed_day(
    '{"consumed_day":{"date_local":"2026-02-30","time_zone":"America/Chicago","utc_instant":"2026-09-13T02:30:00.000Z"}}'::JSONB,
    '2026-09-13T02:30:00Z'::TIMESTAMPTZ
  ) AS impossible_date_falls_back_expect_2026_09_13,
  public.nds_consumed_day(
    '{"consumed_day":{"date_local":"2026-09-01","time_zone":"America/Chicago","utc_instant":"2026-09-13T02:30:00.000Z"}}'::JSONB,
    '2026-09-13T02:30:00Z'::TIMESTAMPTZ
  ) AS inconsistent_claim_falls_back_expect_2026_09_13;

-- Trigger is attached.
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trigger_nds_track_journal_day_revision';

-- RLS is on and no write policy exists.
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE oid = 'public.journal_day_revisions'::regclass;

SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'journal_day_revisions';

-- Grants: authenticated must hold SELECT only.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'journal_day_revisions'
ORDER BY grantee, privilege_type;
