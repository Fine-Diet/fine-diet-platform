-- ============================================================================
-- NDS Integrity v1 — Step 05: computation identity alignment and grants
-- ============================================================================
-- LOCAL APPLICATION ONLY. Upgrade path for clusters that already applied step 02
-- with the 2026-09-12.v1 seed. Fresh installs receive the current identity from
-- step 02; this file is idempotent and must not reinterpret an already-applied
-- generation number as a different formula.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nds_operator') THEN
    CREATE ROLE nds_operator NOLOGIN NOINHERIT;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.nds_assert_generation_matches_source(
  p_nds_version TEXT,
  p_classifier_version TEXT,
  p_normalizer_version TEXT,
  p_day_policy_version TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.nds_computation_generation%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.nds_computation_generation WHERE id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'nds_computation_generation is missing'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF v_row.nds_version IS DISTINCT FROM p_nds_version
     OR v_row.classifier_version IS DISTINCT FROM p_classifier_version
     OR v_row.normalizer_version IS DISTINCT FROM p_normalizer_version
     OR v_row.day_policy_version IS DISTINCT FROM p_day_policy_version THEN
    RAISE EXCEPTION 'active generation % does not denote the requested computation identity',
      v_row.generation
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.nds_assert_generation_matches_source(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nds_assert_generation_matches_source(TEXT, TEXT, TEXT, TEXT)
  TO service_role, nds_operator;

-- Advance only when the stored tuple is not the current application identity.
-- The integer changes so an old build cannot keep the previous generation.
DO $$
DECLARE
  v_nds TEXT := 'nds_daily_2026-01-26.v10';
  v_classifier TEXT := 'processing_classifier_2026-02-08.v2';
  v_normalizer TEXT := 'nds_consumed_normalizer_2026-09-14.v3';
  v_day_policy TEXT := 'nds_day_policy_2026-09-13.v2';
  v_row public.nds_computation_generation%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.nds_computation_generation WHERE id;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_row.nds_version IS DISTINCT FROM v_nds
     OR v_row.classifier_version IS DISTINCT FROM v_classifier
     OR v_row.normalizer_version IS DISTINCT FROM v_normalizer
     OR v_row.day_policy_version IS DISTINCT FROM v_day_policy THEN
    PERFORM public.nds_advance_generation(v_nds, v_classifier, v_normalizer, v_day_policy);
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.nds_advance_generation(TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nds_advance_generation(TEXT, TEXT, TEXT, TEXT)
  TO nds_operator;
