-- Atomic draft merge for programBlueprintV1.
--
-- Locks the addressed program_versions row and merges only that metadata key
-- into the latest document. Unrelated keys stay in place. A missing row, a
-- non-draft, a foreign program, or a protected Baseline version raises instead
-- of returning an empty result.
--
-- Does not replace public.update_journal_updated_at() or the published-version
-- immutability trigger. Apply only through the separately approved migration
-- gate; this file does not write production data by itself.
--
-- Protected version UUIDs match PROTECTED_BASELINE_V1 and
-- UNTOUCHED_BASELINE_DRAFT in lib/programs/baselineMemberBinding.ts.

CREATE OR REPLACE FUNCTION public.merge_program_blueprint_v1_metadata(
  p_program_id uuid,
  p_program_version_id uuid,
  p_program_blueprint_v1 jsonb
)
RETURNS public.program_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_version public.program_versions%ROWTYPE;
  v_updated integer;
BEGIN
  IF p_program_id IS NULL
    OR p_program_version_id IS NULL
    OR p_program_blueprint_v1 IS NULL
    OR pg_catalog.jsonb_typeof(p_program_blueprint_v1) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'programBlueprintV1 must be a JSON object for a program version.'
      USING ERRCODE = '22023';
  END IF;

  -- Baseline v1 and the untouched v2 draft are refused by UUID, including
  -- when those rows are still drafts and the immutability trigger would
  -- otherwise allow a metadata write.
  IF p_program_version_id IN (
    '71fdd834-8a79-4272-bb30-aaa0cf8ab2d7'::uuid,
    'da600c6e-22b7-4e7a-a44e-b2b1daa2bbef'::uuid
  ) THEN
    RAISE EXCEPTION 'Refusing to write Blueprint metadata onto a protected Baseline version.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_version
  FROM public.program_versions AS pv
  WHERE pv.id = p_program_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program version not found.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_version.program_id IS DISTINCT FROM p_program_id THEN
    RAISE EXCEPTION 'program_version_id does not belong to this program.'
      USING ERRCODE = '22023';
  END IF;

  IF v_version.status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Published program versions are immutable. Create a new draft version to make changes.'
      USING ERRCODE = '23514';
  END IF;

  IF pg_catalog.jsonb_typeof(COALESCE(v_version.metadata, '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Program version metadata must be a JSON object.'
      USING ERRCODE = '22023';
  END IF;

  -- The merge expression reads the locked row's metadata. It does not install
  -- a client-built document and does not consult updated_at.
  UPDATE public.program_versions AS pv
  SET metadata = COALESCE(pv.metadata, '{}'::jsonb)
    || pg_catalog.jsonb_build_object('programBlueprintV1', p_program_blueprint_v1)
  WHERE pv.id = p_program_version_id
    AND pv.program_id = p_program_id
    AND pv.status = 'draft'
    AND pv.id NOT IN (
      '71fdd834-8a79-4272-bb30-aaa0cf8ab2d7'::uuid,
      'da600c6e-22b7-4e7a-a44e-b2b1daa2bbef'::uuid
    )
  RETURNING * INTO v_version;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Blueprint metadata was not saved.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_version.id IS DISTINCT FROM p_program_version_id
    OR v_version.program_id IS DISTINCT FROM p_program_id
    OR v_version.status IS DISTINCT FROM 'draft'
    OR (v_version.metadata -> 'programBlueprintV1') IS DISTINCT FROM p_program_blueprint_v1 THEN
    RAISE EXCEPTION 'Blueprint metadata was not saved.'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_version;
END;
$function$;

COMMENT ON FUNCTION public.merge_program_blueprint_v1_metadata(uuid, uuid, jsonb) IS
  'Atomically merge programBlueprintV1 into a locked draft program_versions.metadata row. Rejects a missing row, a foreign program, a non-draft, and protected Baseline v1/v2 version UUIDs. Does not replace unrelated metadata keys. SECURITY INVOKER; EXECUTE granted to service_role only.';

REVOKE ALL ON FUNCTION public.merge_program_blueprint_v1_metadata(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_program_blueprint_v1_metadata(uuid, uuid, jsonb)
  TO service_role;
