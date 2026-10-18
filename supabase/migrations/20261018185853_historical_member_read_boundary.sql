-- Restrict paused and completed authenticated reads to bounded informational
-- modules, and return no check-in templates for those enrollment states.
--
-- Runs only after 20261018171709_pause_historical_day_authorization.sql.
-- Disposable PostgreSQL 17.10 stored these pg_policies.qual fingerprints
-- after that migration. Installation stops when the live expressions differ.
--
--   program_delivery_modules: 534d15dd7eb8ecf57d6e4be9660ea868
--   program_checkin_templates: 140f4be7bf64266cc653ee6d51706101
--
-- Paused enrollments and completed enrollments, including an active stored
-- status with completed_at set, are the only arms that change. Ownership,
-- publication, version binding, status visibility, cancelled exclusion, and
-- the active and pre-start arms stay in place. Table grants and RLS are not
-- altered. This file does not install itself on a remote database.

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
      'historical read migration requires the paused-day authenticated SELECT policies';
  END IF;

  IF to_regprocedure(
    'programs_private.paused_historical_day(date, text, text, integer, integer)'
  ) IS NULL THEN
    RAISE EXCEPTION
      'historical read migration requires programs_private.paused_historical_day';
  END IF;

  modules_md5 := pg_catalog.md5(modules_qual);
  templates_md5 := pg_catalog.md5(templates_qual);

  IF modules_md5 <> '534d15dd7eb8ecf57d6e4be9660ea868' THEN
    RAISE EXCEPTION
      'Refusing to alter program_delivery_modules SELECT policy: qual md5 % does not match the post-pause-ceiling fingerprint 534d15dd7eb8ecf57d6e4be9660ea868',
      modules_md5;
  END IF;

  IF templates_md5 <> '140f4be7bf64266cc653ee6d51706101' THEN
    RAISE EXCEPTION
      'Refusing to alter program_checkin_templates SELECT policy: qual md5 % does not match the post-pause-ceiling fingerprint 140f4be7bf64266cc653ee6d51706101',
      templates_md5;
  END IF;

  IF modules_qual NOT LIKE '%paused_historical_day%'
     OR templates_qual NOT LIKE '%paused_historical_day%'
     OR modules_qual NOT LIKE '%cancelled%'
     OR templates_qual NOT LIKE '%cancelled%'
     OR modules_qual NOT LIKE '%current_person_ids%'
     OR templates_qual NOT LIKE '%current_person_ids%'
     OR modules_qual NOT LIKE '%day_start IS NULL%' THEN
    RAISE EXCEPTION
      'Refusing to alter historical-read policies because a preserved clause is missing';
  END IF;
END
$preflight$;

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
        AND CASE
          WHEN e.status = 'completed' OR e.completed_at IS NOT NULL OR e.status = 'paused' THEN (
            program_delivery_modules.day_start IS NOT NULL
            AND program_delivery_modules.day_end IS NOT NULL
            AND program_delivery_modules.day_start >= 0
            AND program_delivery_modules.day_end >= program_delivery_modules.day_start
            AND program_delivery_modules.module_type IN (
              'prep',
              'week',
              'practice_card',
              'guide',
              'capacity_support',
              'roadmap'
            )
            AND program_delivery_modules.day_start <= CASE
              WHEN e.status = 'completed' OR e.completed_at IS NOT NULL THEN LEAST(
                COALESCE(pv.duration_days, 2147483647),
                GREATEST(0, COALESCE(
                  timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), e.completed_at)::date
                    - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0),
                  timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), now())::date
                    - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0)
                ))
              )
              ELSE programs_private.paused_historical_day(
                e.selected_start_date,
                e.timezone,
                e.metadata ->> 'pause_started_at',
                e.paused_days_total,
                pv.duration_days
              )
            END
          )
          ELSE (
            program_delivery_modules.day_start IS NULL
            OR program_delivery_modules.day_start <= CASE
              WHEN e.status = 'pre_start' THEN 0
              ELSE GREATEST(
                0,
                timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), now())::date
                  - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0)
              )
            END
          )
        END
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
        AND CASE
          WHEN e.status = 'completed' OR e.completed_at IS NOT NULL OR e.status = 'paused' THEN FALSE
          ELSE (
            program_checkin_templates.checkin_day <= CASE
              WHEN e.status = 'pre_start' THEN 0
              ELSE GREATEST(
                0,
                timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC'), now())::date
                  - e.selected_start_date + 1 - COALESCE(e.paused_days_total, 0)
              )
            END
          )
        END
    )
  );
