import fs from 'node:fs';
import path from 'node:path';

describe('paused historical day migration', () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      'supabase/migrations/20261018171709_pause_historical_day_authorization.sql',
    ),
    'utf8',
  );

  test('keeps the helper private, invoker-only, and limited to authenticated execution', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION programs_private.paused_historical_day(');
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('pg_catalog.timezone');
    expect(sql).toContain('pg_catalog.now()');
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION programs_private.paused_historical_day(date, text, text, integer, integer)',
    );
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role;');
    expect(sql).toContain(
      'GRANT EXECUTE ON FUNCTION programs_private.paused_historical_day(date, text, text, integer, integer)\n  TO authenticated;',
    );
    expect(sql).not.toContain('TO anon');
    expect(sql).not.toContain('TO PUBLIC');
    expect(sql).not.toContain('SECURITY DEFINER');
  });

  test('replaces only the paused arms and stops on an unreviewed policy fingerprint', () => {
    expect(sql).toContain("qual md5 % does not match reviewed production fingerprint 4e25cc673cb3338492f0acdfd59dad00");
    expect(sql).toContain("qual md5 % does not match reviewed production fingerprint 1cb96566428950ef81841a77f27b75de");
    expect(sql).toContain('ALTER POLICY "Members can read enrolled available program_delivery_modules"');
    expect(sql).toContain('ALTER POLICY "Users can read own available program_checkin_templates"');
    expect(sql).not.toContain('DROP POLICY');
    expect(sql).not.toContain('DISABLE ROW LEVEL SECURITY');
    expect(sql).not.toContain('GRANT SELECT');
    expect(sql).not.toContain('REVOKE ALL PRIVILEGES ON TABLE');
    expect(sql.match(/programs_private\.paused_historical_day\(/g)).toHaveLength(5);
    expect(sql).not.toContain("(e.metadata ->> 'pause_started_at')::timestamptz");
  });
});
