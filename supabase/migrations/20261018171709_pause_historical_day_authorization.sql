-- Correct the paused-day ceiling on the two authenticated SELECT policies.
--
-- Reviewed production pg_policies.qual fingerprints, captured before this
-- change. Installation stops when the live expression matches neither the
-- production fingerprint nor the disposable PostgreSQL 17 normalization of
-- the same source policy. A disposable build may pretty-print pg_get_expr
-- differently; that known local fingerprint is not permission to apply a
-- semantically different policy.
--
--   program_delivery_modules: 4e25cc673cb3338492f0acdfd59dad00
--   program_checkin_templates: 1cb96566428950ef81841a77f27b75de
--
-- Disposable PostgreSQL 17.10 reproduced both fingerprints from the existing
-- source policies, so no alternate formatting hash is accepted.
--
-- Only the paused arm of each USING expression changes. Ownership, version
-- identity, publication, cancelled enrollment, and the active, pre-start,
-- and completed arms stay in place. Table grants and RLS are not altered.
-- This file does not install itself on a remote database.

DO $preflight$
DECLARE
  modules_qual text;
  templates_qual text;
  modules_md5 text;
  templates_md5 text;
BEGIN
  SELECT qual
    INTO modules_qual
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'program_delivery_modules'
    AND policyname = 'Members can read enrolled available program_delivery_modules';

  SELECT qual
    INTO templates_qual
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'program_checkin_templates'
    AND policyname = 'Users can read own available program_checkin_templates';

  IF modules_qual IS NULL OR templates_qual IS NULL THEN
    RAISE EXCEPTION
      'pause historical day migration requires the existing authenticated SELECT policies';
  END IF;

  IF to_regnamespace('programs_private') IS NULL THEN
    RAISE EXCEPTION 'pause historical day migration requires schema programs_private';
  END IF;

  modules_md5 := pg_catalog.md5(modules_qual);
  templates_md5 := pg_catalog.md5(templates_qual);

  IF modules_md5 <> '4e25cc673cb3338492f0acdfd59dad00' THEN
    RAISE EXCEPTION
      'Refusing to alter program_delivery_modules SELECT policy: qual md5 % does not match reviewed production fingerprint 4e25cc673cb3338492f0acdfd59dad00',
      modules_md5;
  END IF;

  IF templates_md5 <> '1cb96566428950ef81841a77f27b75de' THEN
    RAISE EXCEPTION
      'Refusing to alter program_checkin_templates SELECT policy: qual md5 % does not match reviewed production fingerprint 1cb96566428950ef81841a77f27b75de',
      templates_md5;
  END IF;

  IF modules_qual NOT LIKE '%pause_started_at%'
     OR templates_qual NOT LIKE '%pause_started_at%'
     OR modules_qual NOT LIKE '%cancelled%'
     OR templates_qual NOT LIKE '%cancelled%'
     OR modules_qual NOT LIKE '%current_person_ids%'
     OR templates_qual NOT LIKE '%current_person_ids%' THEN
    RAISE EXCEPTION
      'Refusing to alter paused-day policies because a preserved clause is missing';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION programs_private.paused_historical_day(
  selected_start_date date,
  time_zone text,
  pause_started_at text,
  paused_days_total integer,
  duration_days integer
) RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  zone text;
  today date;
  pause_date date;
  paused_day integer;
  actual_day integer;
  duration_cap integer;
  ceiling integer;
BEGIN
  zone := COALESCE(NULLIF(time_zone, ''), 'UTC');

  BEGIN
    today := (pg_catalog.timezone(zone, pg_catalog.now()))::pg_catalog.date;
  EXCEPTION
    WHEN invalid_parameter_value THEN
      zone := 'UTC';
      today := (pg_catalog.timezone('UTC', pg_catalog.now()))::pg_catalog.date;
  END;

  -- Canonical calendar dates only. Timestamps, blank values, and impossible
  -- days fail closed instead of raising into the caller's SELECT.
  IF pause_started_at IS NULL
     OR pause_started_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RETURN 0;
  END IF;

  BEGIN
    pause_date := pause_started_at::pg_catalog.date;
  EXCEPTION
    WHEN invalid_datetime_format
      OR datetime_field_overflow
      OR invalid_text_representation THEN
      RETURN 0;
  END;

  IF pg_catalog.to_char(pause_date, 'YYYY-MM-DD') IS DISTINCT FROM pause_started_at THEN
    RETURN 0;
  END IF;

  IF pause_date > today OR selected_start_date IS NULL THEN
    RETURN 0;
  END IF;

  paused_day := (pause_date - selected_start_date) + 1 - COALESCE(paused_days_total, 0);
  IF paused_day IS NULL OR paused_day < 0 THEN
    paused_day := 0;
  END IF;
  actual_day := (today - selected_start_date) + 1 - COALESCE(paused_days_total, 0);
  IF actual_day IS NULL OR actual_day < 0 THEN
    actual_day := 0;
  END IF;
  duration_cap := COALESCE(duration_days, 2147483647);

  ceiling := paused_day;
  IF actual_day < ceiling THEN
    ceiling := actual_day;
  END IF;
  IF duration_cap < ceiling THEN
    ceiling := duration_cap;
  END IF;
  IF ceiling < 0 THEN
    RETURN 0;
  END IF;
  RETURN ceiling;
END;
$function$;

REVOKE ALL ON FUNCTION programs_private.paused_historical_day(date, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION programs_private.paused_historical_day(date, text, text, integer, integer)
  TO authenticated;

ALTER POLICY "Members can read enrolled available program_delivery_modules"
  ON public.program_delivery_modules
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
            WHEN e.status = 'paused' THEN programs_private.paused_historical_day(
              e.selected_start_date,
              e.timezone,
              e.metadata ->> 'pause_started_at',
              e.paused_days_total,
              pv.duration_days
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

ALTER POLICY "Users can read own available program_checkin_templates"
  ON public.program_checkin_templates
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
          WHEN e.status = 'paused' THEN programs_private.paused_historical_day(
            e.selected_start_date,
            e.timezone,
            e.metadata ->> 'pause_started_at',
            e.paused_days_total,
            pv.duration_days
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
