-- Target-specific forward migration for the already bootstrapped Programs tables.
-- This intentionally does not replay addProgramsRuntimeTables.sql or
-- addProgramDeliveryModulesTable.sql. Apply only after review and approval.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '2min';

DO $preflight$
DECLARE
  v_missing_tables text[];
  v_missing_roles text[];
  v_rls_disabled text[];
BEGIN
  SELECT array_agg(required.table_name ORDER BY required.table_name)
    INTO v_missing_tables
  FROM unnest(ARRAY[
    'people',
    'programs',
    'program_versions',
    'program_enrollments',
    'program_delivery_modules',
    'program_checkin_templates',
    'program_checkin_responses',
    'program_recommendations'
  ]) AS required(table_name)
  WHERE to_regclass(format('public.%I', required.table_name)) IS NULL;

  IF COALESCE(cardinality(v_missing_tables), 0) > 0 THEN
    RAISE EXCEPTION
      'Programs security migration requires existing bootstrap tables; missing: %',
      array_to_string(v_missing_tables, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'people'
      AND column_name = 'auth_user_id'
  ) THEN
    RAISE EXCEPTION
      'Programs security migration requires public.people.auth_user_id';
  END IF;

  SELECT array_agg(required.table_name ORDER BY required.table_name)
    INTO v_rls_disabled
  FROM unnest(ARRAY[
    'people',
    'programs',
    'program_versions',
    'program_enrollments',
    'program_delivery_modules',
    'program_checkin_templates',
    'program_checkin_responses',
    'program_recommendations'
  ]) AS required(table_name)
  JOIN pg_class c ON c.oid = to_regclass(format('public.%I', required.table_name))
  WHERE NOT c.relrowsecurity;

  IF COALESCE(cardinality(v_rls_disabled), 0) > 0 THEN
    RAISE EXCEPTION
      'Programs security migration requires RLS enabled on: %',
      array_to_string(v_rls_disabled, ', ');
  END IF;

  SELECT array_agg(required.role_name ORDER BY required.role_name)
    INTO v_missing_roles
  FROM unnest(ARRAY['anon', 'authenticated', 'service_role']) AS required(role_name)
  WHERE to_regrole(required.role_name) IS NULL;

  IF COALESCE(cardinality(v_missing_roles), 0) > 0 THEN
    RAISE EXCEPTION
      'Programs security migration requires Supabase roles: %',
      array_to_string(v_missing_roles, ', ');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.program_enrollments e
    JOIN public.program_versions pv ON pv.id = e.program_version_id
    WHERE e.program_id <> pv.program_id
  ) THEN
    RAISE EXCEPTION
      'Programs security migration found enrollment program/version mismatches; repair them before retrying';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.program_delivery_modules dm
    JOIN public.program_versions pv ON pv.id = dm.program_version_id
    WHERE dm.program_id <> pv.program_id
  ) THEN
    RAISE EXCEPTION
      'Programs security migration found delivery module program/version mismatches; repair them before retrying';
  END IF;
END;
$preflight$;

-- Review-only proposal for versioned Programs authoring and publication.
-- Do not execute against shared or production databases without the separately
-- approved privileged-migration gate.
--
-- Both functions are SECURITY INVOKER and granted only to service_role. They
-- are called by role-checked server API routes. The clone and publish writes
-- each run in one PostgreSQL transaction through PostgREST RPC.

CREATE OR REPLACE FUNCTION public.guard_program_versioned_content_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_old_version_id uuid;
  v_new_version_id uuid;
  v_old_version_status text;
  v_new_version_status text;
  v_old_content_status text;
  v_publish_token text := pg_catalog.current_setting(
    'fine_diet.publishing_program_version_id', true
  );
BEGIN
  IF TG_OP <> 'INSERT' THEN
    v_old_version_id := NULLIF(pg_catalog.to_jsonb(OLD) ->> 'program_version_id', '')::uuid;
    IF v_old_version_id IS NOT NULL THEN
      SELECT pv.status INTO v_old_version_status
      FROM public.program_versions pv
      WHERE pv.id = v_old_version_id
      FOR SHARE;
      IF v_old_version_status = 'published'
        AND v_publish_token IS DISTINCT FROM v_old_version_id::text THEN
        RAISE EXCEPTION 'Published program versions are immutable.' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF TG_OP <> 'DELETE' THEN
    v_new_version_id := NULLIF(pg_catalog.to_jsonb(NEW) ->> 'program_version_id', '')::uuid;
    IF v_new_version_id IS NOT NULL THEN
      SELECT pv.status INTO v_new_version_status
      FROM public.program_versions pv
      WHERE pv.id = v_new_version_id
      FOR SHARE;
      IF v_new_version_status = 'published'
        AND v_publish_token IS DISTINCT FROM v_new_version_id::text THEN
        RAISE EXCEPTION 'Published program versions are immutable.' USING ERRCODE = '23514';
      END IF;
      IF TG_OP = 'UPDATE' THEN
        v_old_content_status := pg_catalog.to_jsonb(OLD) ->> 'status';
      END IF;
      IF pg_catalog.to_jsonb(NEW) ->> 'status' = 'published'
        AND v_old_content_status IS DISTINCT FROM 'published'
        AND v_publish_token IS DISTINCT FROM v_new_version_id::text THEN
        RAISE EXCEPTION 'Content can only publish with its program version.' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS program_delivery_modules_version_guard
  ON public.program_delivery_modules;
CREATE TRIGGER program_delivery_modules_version_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.program_delivery_modules
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_versioned_content_write();

DROP TRIGGER IF EXISTS program_checkin_templates_version_guard
  ON public.program_checkin_templates;
CREATE TRIGGER program_checkin_templates_version_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.program_checkin_templates
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_versioned_content_write();

CREATE OR REPLACE FUNCTION public.guard_program_version_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_publish_token text := pg_catalog.current_setting(
    'fine_diet.publishing_program_version_id', true
  );
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' THEN
      RAISE EXCEPTION 'Program versions must be published through the atomic publish operation.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'published' THEN
      RAISE EXCEPTION 'Published program versions are immutable.' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.program_id IS DISTINCT FROM NEW.program_id THEN
    RAISE EXCEPTION 'A program version cannot be reassigned to a different program.'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'published'
    AND (pg_catalog.to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM
        (pg_catalog.to_jsonb(OLD) - 'updated_at') THEN
    RAISE EXCEPTION 'Published program versions are immutable.' USING ERRCODE = '23514';
  END IF;
  IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published'
    AND v_publish_token IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'Versions can only publish through the atomic publish operation.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS program_versions_immutability_guard
  ON public.program_versions;
CREATE TRIGGER program_versions_immutability_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.program_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_version_immutability();

-- Keep the denormalized program_id on enrollments/modules consistent with the
-- parent program_version. These tables retain their current schema and IDs.
CREATE OR REPLACE FUNCTION public.guard_program_version_relationship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_version_program_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'program_enrollments' THEN
    SELECT pv.program_id INTO v_version_program_id
    FROM public.program_versions pv
    WHERE pv.id = NEW.program_version_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Enrollment program version does not exist.' USING ERRCODE = '23503';
    END IF;
    IF v_version_program_id IS DISTINCT FROM NEW.program_id THEN
      RAISE EXCEPTION 'Enrollment program_id must match its program version.'
        USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'program_delivery_modules'
    AND NEW.program_version_id IS NOT NULL THEN
    SELECT pv.program_id INTO v_version_program_id
    FROM public.program_versions pv
    WHERE pv.id = NEW.program_version_id
    FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Delivery module program version does not exist.' USING ERRCODE = '23503';
    END IF;
    IF v_version_program_id IS DISTINCT FROM NEW.program_id THEN
      RAISE EXCEPTION 'Delivery module program_id must match its program version.'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS program_enrollments_version_relationship_guard
  ON public.program_enrollments;
CREATE TRIGGER program_enrollments_version_relationship_guard
  BEFORE INSERT OR UPDATE ON public.program_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_version_relationship();

DROP TRIGGER IF EXISTS program_delivery_modules_version_relationship_guard
  ON public.program_delivery_modules;
CREATE TRIGGER program_delivery_modules_version_relationship_guard
  BEFORE INSERT OR UPDATE ON public.program_delivery_modules
  FOR EACH ROW EXECUTE FUNCTION public.guard_program_version_relationship();

REVOKE ALL ON FUNCTION public.guard_program_versioned_content_write()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_program_version_immutability()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_program_version_relationship()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_program_versioned_content_write()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_program_version_immutability()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.guard_program_version_relationship()
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_program_version_draft(
  p_program_id uuid,
  p_source_version_id uuid DEFAULT NULL,
  p_version_label text DEFAULT NULL,
  p_duration_days integer DEFAULT NULL
)
RETURNS public.program_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_source public.program_versions%ROWTYPE;
  v_version public.program_versions%ROWTYPE;
  v_number integer;
  v_key text;
  v_duration integer;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('program-version-draft:' || p_program_id::text)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.programs p WHERE p.id = p_program_id
  ) THEN
    RAISE EXCEPTION 'Program not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_source_version_id IS NOT NULL THEN
    SELECT * INTO v_source
    FROM public.program_versions pv
    WHERE pv.id = p_source_version_id
      AND pv.program_id = p_program_id
      AND pv.status = 'published'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source version must be published and belong to this program.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_duration_days IS NOT NULL AND p_duration_days < 1 THEN
    RAISE EXCEPTION 'Duration must be at least one day.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(pv.version_number), 0) + 1 INTO v_number
  FROM public.program_versions pv
  WHERE pv.program_id = p_program_id;

  v_key := 'v' || v_number::text || '-' ||
    pg_catalog.substring(pg_catalog.replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_duration := COALESCE(
    p_duration_days,
    CASE WHEN p_source_version_id IS NOT NULL THEN v_source.duration_days ELSE NULL END
  );

  INSERT INTO public.program_versions (
    program_id, version_key, version_label, version_number, status,
    duration_days, default_unlock_day, metadata
  ) VALUES (
    p_program_id, v_key, NULLIF(pg_catalog.btrim(p_version_label), ''),
    v_number, 'draft', v_duration,
    CASE WHEN p_source_version_id IS NOT NULL THEN v_source.default_unlock_day ELSE 1 END,
    CASE WHEN p_source_version_id IS NOT NULL THEN COALESCE(v_source.metadata, '{}'::jsonb) ELSE '{}'::jsonb END
  ) RETURNING * INTO v_version;

  IF p_source_version_id IS NOT NULL THEN
    INSERT INTO public.program_delivery_modules (
      program_id, program_version_id, module_key, module_type, title, eyebrow,
      body, day_start, day_end, status_visibility, capacity_variants_json,
      cta_json, anchor_json, display_order, status, safety_notes,
      no_claims_notes, metadata
    )
    SELECT
      dm.program_id, v_version.id, dm.module_key, dm.module_type, dm.title,
      dm.eyebrow, dm.body, dm.day_start, dm.day_end, dm.status_visibility,
      dm.capacity_variants_json, dm.cta_json, dm.anchor_json, dm.display_order,
      'draft', dm.safety_notes, dm.no_claims_notes, dm.metadata
    FROM public.program_delivery_modules dm
    WHERE dm.program_id = p_program_id
      AND dm.program_version_id = p_source_version_id
      AND dm.status = 'published'
    ORDER BY dm.display_order, dm.created_at;

    INSERT INTO public.program_checkin_templates (
      program_version_id, checkin_day, title, description, prompt_md,
      questions_json, status, metadata
    )
    SELECT
      v_version.id, ct.checkin_day, ct.title, ct.description, ct.prompt_md,
      ct.questions_json, 'draft', ct.metadata
    FROM public.program_checkin_templates ct
    WHERE ct.program_version_id = p_source_version_id
      AND ct.status = 'published'
    ORDER BY ct.checkin_day;
  END IF;

  RETURN v_version;
END;
$function$;

CREATE OR REPLACE FUNCTION public.publish_program_version(
  p_program_id uuid,
  p_program_version_id uuid
)
RETURNS public.program_versions
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_version public.program_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_version
  FROM public.program_versions pv
  WHERE pv.id = p_program_version_id
    AND pv.program_id = p_program_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program version not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Publishing an already published immutable version is an idempotent read.
  IF v_version.status = 'published' THEN
    RETURN v_version;
  END IF;
  IF v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft versions can be published.' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.set_config(
    'fine_diet.publishing_program_version_id', v_version.id::text, true
  );
  IF EXISTS (
    SELECT 1 FROM public.program_enrollments e
    WHERE e.program_version_id = v_version.id
      AND e.status IN ('pre_start', 'active', 'paused')
  ) THEN
    RAISE EXCEPTION 'A version with open enrollments cannot be published or replaced.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.program_delivery_modules dm
    WHERE dm.program_version_id = v_version.id
      AND dm.program_id <> v_version.program_id
  ) THEN
    RAISE EXCEPTION 'Delivery module program_id must match its program version.'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.program_enrollments e
    WHERE e.program_version_id = v_version.id
      AND e.program_id <> v_version.program_id
  ) THEN
    RAISE EXCEPTION 'Enrollment program_id must match its program version.'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.program_delivery_modules dm
    WHERE dm.program_id = p_program_id
      AND dm.program_version_id = v_version.id
      AND dm.status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Add at least one draft delivery module before publishing.'
      USING ERRCODE = '23514';
  END IF;
  IF v_version.duration_days IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_delivery_modules dm
    WHERE dm.program_version_id = v_version.id
      AND dm.status = 'draft'
      AND (
        dm.day_start > v_version.duration_days
        OR dm.day_end > v_version.duration_days
      )
  ) THEN
    RAISE EXCEPTION 'Delivery module day window exceeds the version duration.'
      USING ERRCODE = '23514';
  END IF;
  IF v_version.duration_days IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.program_checkin_templates ct
    WHERE ct.program_version_id = v_version.id
      AND ct.status = 'draft'
      AND ct.checkin_day > v_version.duration_days
  ) THEN
    RAISE EXCEPTION 'Check-in day exceeds the version duration.'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.program_delivery_modules dm
  SET status = 'published'
  WHERE dm.program_id = p_program_id
    AND dm.program_version_id = v_version.id
    AND dm.status = 'draft';

  UPDATE public.program_checkin_templates ct
  SET status = 'published'
  WHERE ct.program_version_id = v_version.id
    AND ct.status = 'draft';

  UPDATE public.program_versions pv
  SET status = 'published', published_at = pg_catalog.now()
  WHERE pv.id = v_version.id
  RETURNING * INTO v_version;

  RETURN v_version;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_program_version_draft(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_program_version(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_program_version_draft(uuid, uuid, text, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_program_version(uuid, uuid)
  TO service_role;

-- Review-only hardening proposal for the existing Programs runtime tables.
-- Requires the runtime and delivery-module bootstrap tables to exist.
-- Maps the authenticated JWT to only its associated people rows without
-- requiring a direct SELECT policy on public.people.
-- Keep programs_private outside the PostgREST exposed schemas.

CREATE SCHEMA IF NOT EXISTS programs_private AUTHORIZATION postgres;

CREATE OR REPLACE FUNCTION programs_private.current_person_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id
  FROM public.people AS p
  WHERE p.auth_user_id = (SELECT auth.uid())
$function$;

REVOKE ALL ON FUNCTION programs_private.current_person_ids()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA programs_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA programs_private TO authenticated;
GRANT EXECUTE ON FUNCTION programs_private.current_person_ids()
  TO authenticated;

DROP POLICY IF EXISTS "Users can read own enrolled program_versions"
  ON public.program_versions;
DROP POLICY IF EXISTS "Users can read own enrolled published program_versions"
  ON public.program_versions;
CREATE POLICY "Users can read own enrolled published program_versions"
  ON public.program_versions FOR SELECT TO authenticated
  USING (
    program_versions.status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.program_enrollments AS e
      JOIN public.programs AS p ON p.id = e.program_id
      WHERE e.program_version_id = program_versions.id
        AND e.program_id = program_versions.program_id
        AND e.person_id IN (
          SELECT programs_private.current_person_ids()
        )
        AND e.status <> 'cancelled'
        AND p.status = 'published'
    )
  );

DROP POLICY IF EXISTS "Users can read own program_enrollments"
  ON public.program_enrollments;
CREATE POLICY "Users can read own program_enrollments"
  ON public.program_enrollments FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT programs_private.current_person_ids()
    )
  );

DROP POLICY IF EXISTS "Authenticated can read published program_delivery_modules"
  ON public.program_delivery_modules;
DROP POLICY IF EXISTS "Members can read enrolled available program_delivery_modules"
  ON public.program_delivery_modules;
CREATE POLICY "Members can read enrolled available program_delivery_modules"
  ON public.program_delivery_modules FOR SELECT TO authenticated
  USING (
    program_delivery_modules.status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.program_enrollments AS e
      JOIN public.programs AS p ON p.id = e.program_id
      JOIN public.program_versions AS pv ON pv.id = e.program_version_id
      WHERE e.person_id IN (
          SELECT programs_private.current_person_ids()
        )
        AND e.program_id = program_delivery_modules.program_id
        AND e.program_version_id = program_delivery_modules.program_version_id
        AND pv.program_id = e.program_id
        AND e.status <> 'cancelled'
        AND p.status = 'published'
        AND pv.status = 'published'
        AND program_delivery_modules.program_version_id IS NOT NULL
        AND program_delivery_modules.status_visibility @> ARRAY[
          CASE
            WHEN e.status = 'completed' OR e.completed_at IS NOT NULL THEN 'completed'
            WHEN e.status = 'paused' THEN 'paused'
            WHEN e.status = 'pre_start' THEN 'pre_start'
            WHEN (timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), now())::date
                  - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0)) <= 0 THEN 'pre_start'
            ELSE 'active'
          END
        ]::text[]
        AND (
          program_delivery_modules.day_start IS NULL
          OR program_delivery_modules.day_start <= CASE
            WHEN e.status = 'pre_start' THEN 0
            WHEN e.status = 'completed' OR e.completed_at IS NOT NULL
              THEN LEAST(
                COALESCE(pv.duration_days, 2147483647),
                GREATEST(0, COALESCE(
                  timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), e.completed_at)::date
                    - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0),
                  timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), now())::date
                    - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0)
                ))
              )
            WHEN e.status = 'paused' THEN GREATEST(
              0,
              COALESCE(
                timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'),
                  (e.metadata ->> 'pause_started_at')::timestamptz)::date
                  - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0),
                0
              )
            )
            ELSE GREATEST(
              0,
              timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), now())::date
                - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0)
            )
          END
        )
    )
  );

DROP POLICY IF EXISTS "Users can read own program_checkin_templates"
  ON public.program_checkin_templates;
DROP POLICY IF EXISTS "Users can read own available program_checkin_templates"
  ON public.program_checkin_templates;
CREATE POLICY "Users can read own available program_checkin_templates"
  ON public.program_checkin_templates FOR SELECT TO authenticated
  USING (
    program_checkin_templates.status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.program_enrollments AS e
      JOIN public.programs AS p ON p.id = e.program_id
      JOIN public.program_versions AS pv ON pv.id = e.program_version_id
      WHERE e.person_id IN (
          SELECT programs_private.current_person_ids()
        )
        AND e.program_version_id = program_checkin_templates.program_version_id
        AND pv.program_id = e.program_id
        AND e.status <> 'cancelled'
        AND p.status = 'published'
        AND pv.status = 'published'
        AND program_checkin_templates.checkin_day <= CASE
          WHEN e.status = 'completed' OR e.completed_at IS NOT NULL THEN LEAST(
            COALESCE(pv.duration_days, 2147483647),
            GREATEST(0, COALESCE(
              timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), e.completed_at)::date
                - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0),
              timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), now())::date
                - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0)
            ))
          )
          WHEN e.status = 'paused' THEN GREATEST(
            0,
            COALESCE(
              timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'),
                (e.metadata ->> 'pause_started_at')::timestamptz)::date
                - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0),
              0
            )
          )
          WHEN e.status = 'pre_start' THEN 0
          ELSE GREATEST(
            0,
            timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), now())::date
              - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0)
          )
        END
    )
  );

DROP POLICY IF EXISTS "Users can read own program_checkin_responses"
  ON public.program_checkin_responses;
CREATE POLICY "Users can read own program_checkin_responses"
  ON public.program_checkin_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.program_enrollments AS e
      WHERE e.id = program_checkin_responses.enrollment_id
        AND e.person_id IN (
          SELECT programs_private.current_person_ids()
        )
    )
  );

DROP POLICY IF EXISTS "Users can read own program_recommendations"
  ON public.program_recommendations;
CREATE POLICY "Users can read own program_recommendations"
  ON public.program_recommendations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.program_enrollments AS e
      WHERE e.id = program_recommendations.enrollment_id
        AND e.person_id IN (
          SELECT programs_private.current_person_ids()
        )
    )
  );

-- Direct app server operations use service_role. Authenticated receives only
-- RLS-filtered reads; anonymous and PUBLIC receive no table privileges.
-- Remove non-DML powers, including MAINTAIN, TRUNCATE, REFERENCES and TRIGGER.
REVOKE ALL PRIVILEGES ON TABLE
  public.program_versions,
  public.program_enrollments,
  public.program_delivery_modules,
  public.program_checkin_templates,
  public.program_checkin_responses,
  public.program_recommendations
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE
  public.program_versions,
  public.program_enrollments,
  public.program_delivery_modules,
  public.program_checkin_templates,
  public.program_checkin_responses,
  public.program_recommendations
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.program_versions,
  public.program_enrollments,
  public.program_delivery_modules,
  public.program_checkin_templates,
  public.program_checkin_responses,
  public.program_recommendations
TO service_role;

COMMIT;
