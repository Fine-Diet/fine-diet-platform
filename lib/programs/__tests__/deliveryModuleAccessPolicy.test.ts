import fs from 'node:fs';
import path from 'node:path';

describe('delivery module RLS policy proposal', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'scripts/hardenProgramDeliveryModuleMemberReadPolicy.sql'),
    'utf8',
  );
  const runtimeSql = fs.readFileSync(
    path.join(process.cwd(), 'scripts/addProgramsRuntimeTables.sql'),
    'utf8',
  );

  test('restricts direct authenticated reads to the caller-owned exact version and current day', () => {
    expect(sql).toContain('TO authenticated');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION programs_private.current_person_ids()');
    expect(sql).toContain('WHERE p.auth_user_id = (SELECT auth.uid())');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION programs_private.current_person_ids()');
    expect(sql).toContain('SELECT programs_private.current_person_ids()');
    expect(sql).toContain('e.program_version_id = program_delivery_modules.program_version_id');
    expect(sql).toContain('program_delivery_modules.program_version_id IS NOT NULL');
    expect(sql).toContain("e.status <> 'cancelled'");
    expect(sql).toContain('program_delivery_modules.day_start <= CASE');
    expect(sql).toContain("(e.metadata ->> 'pause_started_at')::timestamptz");
    expect(sql).toContain("timezone(COALESCE(NULLIF(e.timezone, ''), 'UTC')");
    expect(sql).not.toContain('Authenticated can read published program_delivery_modules"\n  ON public.program_delivery_modules FOR SELECT\n  USING');
  });

  test('keeps pre-start and completed access within their intended windows', () => {
    expect(sql).toContain("WHEN e.status = 'pre_start' THEN 0");
    expect(sql).toContain('pv.duration_days');
  });

  test('direct check-in template reads require published templates within the owned enrollment day', () => {
    expect(sql).toContain('program_checkin_templates.status = \'published\'');
    expect(sql).toContain('e.program_version_id = program_checkin_templates.program_version_id');
    expect(sql).toContain('program_checkin_templates.checkin_day <= CASE');
    expect(sql).toContain('DROP POLICY IF EXISTS "Users can read own program_checkin_templates"');
    expect(runtimeSql).toContain('program_checkin_templates.status = \'published\'');
    expect(runtimeSql).toContain("(e.metadata ->> 'pause_started_at')::timestamptz");
    expect(runtimeSql).toContain('timezone(COALESCE(NULLIF(e.timezone, \'\'), \'UTC\')');
  });
});
