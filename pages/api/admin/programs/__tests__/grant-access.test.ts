const mockRequireRole = jest.fn();
const mockCreateEnrollment = jest.fn();
const mockGetSummary = jest.fn();
const mockAssignment = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/authServer', () => ({
  requireRoleFromApi: (...args: unknown[]) => mockRequireRole(...args),
}));
jest.mock('@/lib/programs/programRuntimeServerService', () => {
  const actual = jest.requireActual('@/lib/programs/programRuntimeServerService');
  return {
    ...actual,
    createProgramEnrollmentFromAccess: (...args: unknown[]) => mockCreateEnrollment(...args),
    getProgramRuntimeSummaryForPerson: (...args: unknown[]) => mockGetSummary(...args),
  };
});
jest.mock('@/lib/plans/programAssignmentAutomationServerService', () => ({
  handleAdminEntitlementGrant: (...args: unknown[]) => mockAssignment(...args),
}));
jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import handler from '../grant-access';
import { DEFAULT_ENROLLMENT_VERSION_METADATA_KEY } from '@/lib/programs/enrollmentAuthorization';

const personId = '10000000-0000-4000-8000-000000000001';
const programId = 'program-1';
const publishedVersionId = 'f7d82542-b906-4f9a-b658-d076bf3b37fa';
const draftVersionId = 'da600c6e-22b7-4e7a-a44e-b2b1daa2bbef';
const foreignVersionId = '11111111-1111-4111-8111-111111111111';
const missingVersionId = '22222222-2222-4222-8222-222222222222';
const pinnedVersionId = '71fdd834-8a79-4272-bb30-aaa0cf8ab2d7';
const enrollmentId = '20000000-0000-4000-8000-000000000002';

type VersionRow = {
  id: string;
  program_id: string;
  status: string;
  duration_days: number;
  metadata: Record<string, unknown>;
} | null;

let programMetadata: Record<string, unknown>;
let versionRow: VersionRow;
let openEnrollment: Record<string, unknown> | null;
let activeEntitlements: Record<string, unknown>[];
let events: string[];

function publishedVersion(id = publishedVersionId): NonNullable<VersionRow> {
  return {
    id,
    program_id: programId,
    status: 'published',
    duration_days: 21,
    metadata: {},
  };
}

function query(table: string) {
  const filters: Record<string, unknown> = {};
  const q: Record<string, jest.Mock> = {};
  for (const method of ['select', 'order', 'limit', 'update']) {
    q[method] = jest.fn().mockReturnValue(q);
  }
  q.eq = jest.fn((column: string, value: unknown) => {
    filters[column] = value;
    return q;
  });
  q.in = jest.fn().mockReturnValue(q);
  q.insert = jest.fn(() => {
    events.push(`${table}:insert`);
    return q;
  });
  q.maybeSingle = jest.fn(async () => {
    if (table === 'people') return { data: { id: personId }, error: null };
    if (table === 'programs') {
      return {
        data: {
          id: programId,
          slug: 'baseline',
          title: 'Baseline',
          status: 'published',
          metadata: programMetadata,
        },
        error: null,
      };
    }
    if (table === 'program_enrollments') {
      return { data: openEnrollment, error: null };
    }
    if (table === 'program_versions') {
      events.push('program_versions:read');
      if (filters.id) {
        return {
          data: versionRow && filters.id === versionRow.id ? versionRow : null,
          error: null,
        };
      }
      const matchesLatest = versionRow
        && filters.status === 'published'
        && versionRow.status === 'published'
        && filters.program_id === versionRow.program_id;
      return { data: matchesLatest ? versionRow : null, error: null };
    }
    return { data: null, error: null };
  });
  q.single = jest.fn(async () => ({
    data: table === 'person_entitlements'
      ? { id: 'entitlement-new', person_id: personId, is_active: true }
      : null,
    error: null,
  }));
  q.then = jest.fn((resolve, reject) => Promise.resolve({
    data: table === 'person_entitlements' ? activeEntitlements : null,
    error: null,
  }).then(resolve, reject));
  return q;
}

function response() {
  const out: { statusCode: number; body?: unknown; headers: Record<string, unknown> } = {
    statusCode: 200,
    headers: {},
  };
  const res = {
    status(code: number) { out.statusCode = code; return res; },
    json(body: unknown) { out.body = body; return res; },
    setHeader(name: string, value: unknown) { out.headers[name] = value; return res; },
  };
  return { res, out };
}

function grantBody(overrides: Record<string, unknown> = {}) {
  return {
    person_id: personId,
    program_slug: 'baseline',
    create_enrollment_now: true,
    selected_start_date: '2026-05-22',
    timezone: 'UTC',
    ...overrides,
  };
}

function expectNoGrantWrites() {
  expect(events).not.toContain('person_entitlements:insert');
  expect(events).not.toContain('assignment');
  expect(events).not.toContain('enrollment');
  expect(mockAssignment).not.toHaveBeenCalled();
  expect(mockCreateEnrollment).not.toHaveBeenCalled();
}

describe('admin program access grant version targeting', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    events = [];
    programMetadata = {};
    versionRow = publishedVersion();
    openEnrollment = null;
    activeEntitlements = [{ id: 'entitlement-1', is_active: true }];
    mockRequireRole.mockResolvedValue({ id: 'admin-1', role: 'admin' });
    mockAssignment.mockImplementation(async () => {
      events.push('assignment');
      return { action: 'unchanged', reason: null };
    });
    mockCreateEnrollment.mockImplementation(async () => {
      events.push('enrollment');
      return { id: enrollmentId, program_version_id: publishedVersionId };
    });
    mockGetSummary.mockResolvedValue({
      enrollment: { id: enrollmentId, program_version_id: publishedVersionId },
    });
    mockFrom.mockImplementation((table: string) => query(table));
  });

  test('passes an exact published version only after the admin role check', async () => {
    const granted = response();
    await handler({
      method: 'POST',
      body: grantBody({
        program_version_id: publishedVersionId,
        authorization: 'member',
      }),
    } as any, granted.res as any);

    expect(mockRequireRole).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      ['admin'],
    );
    expect(granted.out.statusCode).toBe(200);
    expect(events.indexOf('program_versions:read')).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('program_versions:read')).toBeLessThan(events.indexOf('assignment'));
    expect(events.indexOf('assignment')).toBeLessThan(events.indexOf('enrollment'));
    expect(mockCreateEnrollment).toHaveBeenCalledWith(expect.objectContaining({
      personId,
      programSlug: 'baseline',
      programVersionId: publishedVersionId,
      authorization: 'verified_admin_grant',
    }));
  });

  test('omits a version pin when the admin does not supply one', async () => {
    const granted = response();
    await handler({ method: 'POST', body: grantBody() } as any, granted.res as any);

    expect(granted.out.statusCode).toBe(200);
    expect(mockCreateEnrollment.mock.calls[0][0]).not.toHaveProperty('programVersionId');
    expect(mockCreateEnrollment.mock.calls[0][0].authorization).toBe('verified_admin_grant');
  });

  test('grants access without enrollment when create_enrollment_now is omitted', async () => {
    versionRow = { ...publishedVersion(draftVersionId), status: 'draft' };
    activeEntitlements = [];
    const granted = response();
    await handler({
      method: 'POST',
      body: {
        person_id: personId,
        program_slug: 'baseline',
        program_version_id: draftVersionId,
      },
    } as any, granted.res as any);

    expect(granted.out.statusCode).toBe(201);
    expect(events).toContain('person_entitlements:insert');
    expect(events).toContain('assignment');
    expect(events).not.toContain('program_versions:read');
    expect(events).not.toContain('enrollment');
    expect(mockCreateEnrollment).not.toHaveBeenCalled();
  });

  test('does not enroll when the caller is not a verified admin', async () => {
    mockRequireRole.mockResolvedValueOnce(null);
    const denied = response();
    await handler({
      method: 'POST',
      body: grantBody({ program_version_id: publishedVersionId }),
    } as any, denied.res as any);

    expectNoGrantWrites();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test('rejects a malformed version before any grant write', async () => {
    activeEntitlements = [];
    const invalid = response();
    await handler({
      method: 'POST',
      body: grantBody({ program_version_id: 'version-v3' }),
    } as any, invalid.res as any);

    expect(invalid.out.statusCode).toBe(400);
    expectNoGrantWrites();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'missing',
      versionId: missingVersionId,
      row: null,
      statusCode: 404,
    },
    {
      name: 'draft',
      versionId: draftVersionId,
      row: { ...publishedVersion(draftVersionId), status: 'draft' },
      statusCode: 400,
    },
    {
      name: 'foreign-program',
      versionId: foreignVersionId,
      row: { ...publishedVersion(foreignVersionId), program_id: 'program-other' },
      statusCode: 404,
    },
  ])(
    'rejects a $name enrollment target before entitlement, assignment, or enrollment',
    async ({ versionId, row, statusCode }) => {
      activeEntitlements = [];
      versionRow = row;
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const denied = response();
      await handler({
        method: 'POST',
        body: grantBody({ program_version_id: versionId }),
      } as any, denied.res as any);

      expect(denied.out.statusCode).toBe(statusCode);
      expect(events).toContain('program_versions:read');
      expectNoGrantWrites();
    },
  );

  test.each([
    {
      name: 'malformed pointer',
      metadata: { [DEFAULT_ENROLLMENT_VERSION_METADATA_KEY]: 3 },
      row: publishedVersion(),
      readsVersion: false,
    },
    {
      name: 'missing pointer',
      metadata: { [DEFAULT_ENROLLMENT_VERSION_METADATA_KEY]: missingVersionId },
      row: null,
      readsVersion: true,
    },
    {
      name: 'draft pointer',
      metadata: { [DEFAULT_ENROLLMENT_VERSION_METADATA_KEY]: draftVersionId },
      row: { ...publishedVersion(draftVersionId), status: 'draft' },
      readsVersion: true,
    },
    {
      name: 'foreign pointer',
      metadata: { [DEFAULT_ENROLLMENT_VERSION_METADATA_KEY]: foreignVersionId },
      row: { ...publishedVersion(foreignVersionId), program_id: 'program-other' },
      readsVersion: true,
    },
  ])(
    'rejects an invalid configured default ($name) before any grant write',
    async ({ metadata, row, readsVersion }) => {
      activeEntitlements = [];
      programMetadata = metadata;
      versionRow = row;
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const denied = response();
      await handler({ method: 'POST', body: grantBody() } as any, denied.res as any);

      expect(denied.out.statusCode).toBe(409);
      expect(events.includes('program_versions:read')).toBe(readsVersion);
      expectNoGrantWrites();
    },
  );

  test('keeps an existing open enrollment idempotent when the requested target is a draft', async () => {
    openEnrollment = {
      id: enrollmentId,
      person_id: personId,
      program_id: programId,
      program_slug: 'baseline',
      program_version_id: pinnedVersionId,
      source_type: 'entitlement',
      source_ref: null,
      entitlement_key: 'program:baseline',
      assignment_id: null,
      purchase_date: null,
      selected_start_date: '2099-01-01',
      started_at: null,
      completed_at: null,
      status: 'pre_start',
      timezone: 'UTC',
      current_capacity: 'steady',
      paused_days_total: 0,
      pause_until: null,
      input_snapshot_json: {},
      computed_metrics_snapshot_json: {},
      metadata: {},
      created_by_user_id: null,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
    };
    versionRow = publishedVersion(pinnedVersionId);
    const granted = response();
    await handler({
      method: 'POST',
      body: grantBody({ program_version_id: draftVersionId }),
    } as any, granted.res as any);

    expect(granted.out.statusCode).toBe(200);
    expect(mockCreateEnrollment).toHaveBeenCalledWith(expect.objectContaining({
      programVersionId: draftVersionId,
      authorization: 'verified_admin_grant',
    }));
    expect(events).toContain('assignment');
    expect(events).toContain('enrollment');
  });
});
