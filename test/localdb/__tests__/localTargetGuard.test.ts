import { inspectLocalTarget, FORBIDDEN_CONNECTION_ENV } from '../localTargetGuard';

describe('nds01a-local-target-guard', () => {
  it('refuses a hostname even when it is localhost', () => {
    const outcome = inspectLocalTarget({
      runId: 'nds01a_0123456789abcdef',
      host: 'localhost',
      database: 'nds01a_0123456789abcdef_db',
      user: 'nds01a_owner',
      dataDirectory: '/tmp/nds01a_0123456789abcdef/data',
      markerPath: '/tmp/nds01a_0123456789abcdef/data/NDS01A_RUN_MARKER.json',
      postmasterPid: 1,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.checks.find((check) => check.id === 'host_is_unix_socket_directory_not_hostname')?.passed).toBe(
      false,
    );
  });

  it('lists inherited credential variables that must be absent', () => {
    expect(FORBIDDEN_CONNECTION_ENV).toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'SUPABASE_SERVICE_ROLE_KEY',
        'NEXT_PUBLIC_SUPABASE_URL',
      ]),
    );
  });
});
