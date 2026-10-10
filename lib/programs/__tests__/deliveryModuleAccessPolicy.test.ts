import fs from 'node:fs';
import path from 'node:path';

describe('Programs runtime security hardening migration', () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      'supabase/migrations/20261010012536_programs_runtime_security_hardening.sql',
    ),
    'utf8',
  );

  test('maps authenticated users to their own people rows through a restricted private helper', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION programs_private.current_person_ids()');
    expect(sql).toContain('WHERE p.auth_user_id = (SELECT auth.uid())');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('REVOKE ALL ON SCHEMA programs_private FROM PUBLIC, anon, authenticated, service_role');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION programs_private.current_person_ids()');
    expect(sql).toContain('TO authenticated;');
  });

  test('restricts direct module reads to published content on the caller-owned enrolled version and day', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Authenticated can read published program_delivery_modules"');
    expect(sql).toContain('CREATE POLICY "Members can read enrolled available program_delivery_modules"');
    expect(sql).toContain('ON public.program_delivery_modules FOR SELECT TO authenticated');
    expect(sql).toContain("program_delivery_modules.status = 'published'");
    expect(sql).toContain('e.person_id IN (');
    expect(sql).toContain('SELECT programs_private.current_person_ids()');
    expect(sql).toContain('e.program_version_id = program_delivery_modules.program_version_id');
    expect(sql).toContain('program_delivery_modules.program_version_id IS NOT NULL');
    expect(sql).toContain("e.status <> 'cancelled'");
    expect(sql).toContain('program_delivery_modules.day_start <= CASE');
    expect(sql).toContain("(e.metadata ->> 'pause_started_at')::timestamptz");
    expect(sql).not.toContain('CREATE POLICY "Authenticated can read published program_delivery_modules"');
  });

  test('restricts direct check-in template reads to published templates on the enrolled version and accessible day', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Users can read own program_checkin_templates"');
    expect(sql).toContain('CREATE POLICY "Users can read own available program_checkin_templates"');
    expect(sql).toContain("program_checkin_templates.status = 'published'");
    expect(sql).toContain('e.program_version_id = program_checkin_templates.program_version_id');
    expect(sql).toContain('program_checkin_templates.checkin_day <= CASE');
  });
});
