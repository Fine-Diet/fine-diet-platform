/**
 * API/service integration coverage for current program access.
 *
 * The actual API handlers, library service, and content-delivery service run
 * together. Only external auth and database client boundaries are isolated;
 * row policy behavior is covered separately by the disposable PostgreSQL
 * role-level suite.
 */

let mockPersonId = 'person-a';
let mockEntitlementRows: Array<Record<string, unknown>> = [];
let mockAssignmentRows: Array<Record<string, unknown>> = [];
let mockQueryTables: string[] = [];
let mockDeliveryModules = [{ id: 'delivery-0', moduleType: 'prep', dayStart: 0, dayEnd: 0, statusVisibility: ['pre_start', 'active'] }];
let mockFrom: jest.Mock;
let mockListEnrollments: jest.Mock;
let mockLatestVersion: jest.Mock;
let mockDelivery: jest.Mock;
let mockRequireAuth: jest.Mock;
let mockResolvePerson: jest.Mock;

jest.mock('@/lib/supabaseServerClient', () => {
  mockFrom = jest.fn((table: string) => {
    mockQueryTables.push(table);
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query: any = {
      select: () => query,
      eq: (column: string, expected: unknown) => {
        filters.push((row) => row[column] === expected);
        return query;
      },
      lte: (column: string, expected: string) => {
        filters.push((row) => Date.parse(String(row[column])) <= Date.parse(expected));
        return query;
      },
      or: (expression: string) => {
        const match = expression.match(/^ends_at\.is\.null,ends_at\.gt\.(.+)$/);
        if (match) {
          const now = Date.parse(match[1]);
          filters.push((row) => row.ends_at == null || Date.parse(String(row.ends_at)) > now);
        }
        return query;
      },
      in: (column: string, expected: unknown[]) => {
        filters.push((row) => expected.includes(row[column]));
        return query;
      },
      limit: () => query,
      order: () => query,
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => {
        const source: Record<string, Array<Record<string, unknown>>> = {
          programs: [{
            id: 'program-1', slug: 'gut-reset', title: 'Gut Reset', tagline: null,
            description: 'Published program', storefront_href: null, status: 'published',
          }],
          program_modules: [{
            id: 'module-1', program_id: 'program-1', title: 'Core module',
            description: null, ordinal: 0, status: 'published',
          }],
          program_content_items: [{
            id: 'item-1', module_id: 'module-1', item_type: 'article',
            title: 'Protected lesson', summary: null, body: 'protected body',
            video_url: null, video_provider: null, estimated_minutes: 5,
            ordinal: 0, status: 'published',
          }],
          person_entitlements: mockEntitlementRows,
        };
        const data = (source[table] ?? []).filter((row) => filters.every((filter) => filter(row)));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  });
  return { supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) } };
});

jest.mock('@/lib/access/requireJournalAccess', () => {
  mockRequireAuth = jest.fn();
  mockResolvePerson = jest.fn();
  return {
    requireJournalAuth: (...args: unknown[]) => mockRequireAuth(...args),
    resolveJournalTargetPerson: (...args: unknown[]) => mockResolvePerson(...args),
  };
});

jest.mock('@/lib/plans/programAssignmentServerService', () => ({
  listAssignments: jest.fn(async () => ({ rows: mockAssignmentRows, total: mockAssignmentRows.length, limit: 200, offset: 0 })),
  resolveInheritedGuidanceForPerson: jest.fn(async () => ({ resolved: [], active_assignments: [], resolved_at: new Date().toISOString() })),
}));

jest.mock('@/lib/plans/programRuntimeSummaryServerService', () => ({
  deriveImpactBullets: jest.fn(() => []),
  slugToTitle: jest.fn((slug: string) => slug),
}));

jest.mock('@/lib/programs/catalogue', () => ({
  resolveProgramCatalogueEntry: jest.fn(async (slug: string) => ({
    slug, title: 'Gut Reset', tagline: null, description: 'Published program',
    modules: [], storefront_href: null, is_stub: false,
  })),
}));

jest.mock('@/lib/programs/programProgressServerService', () => ({
  listProgressHeadlinesForPerson: jest.fn(async () => []),
  getProgramProgressSummary: jest.fn(async (personId: string, slug: string) => ({
    person_id: personId, program_slug: slug, items_total: 0, items_completed: 0,
    items_in_progress: 0, percent_complete: 0, aggregate_status: 'not_started',
    resume_content_item_id: null, last_viewed_at: null, modules: [],
  })),
}));

jest.mock('@/lib/programs/programAvailabilityServerService', () => ({
  computeProgramAvailabilityForPerson: jest.fn(async () => ({ entries: [], resolved_at: new Date().toISOString() })),
}));

jest.mock('@/lib/programs/programRuntimeServerService', () => {
  mockListEnrollments = jest.fn(async () => []);
  mockLatestVersion = jest.fn(async () => ({ id: 'version-1', status: 'published' }));
  return {
    listEnrollmentsForPerson: (...args: unknown[]) => mockListEnrollments(...args),
    getLatestPublishedProgramVersionForSlug: (...args: unknown[]) => mockLatestVersion(...args),
    getProgramRuntimeSummaryForPerson: jest.fn(),
  };
});

jest.mock('@/lib/programs/deliveryModuleDeliveryServerService', () => {
  mockDelivery = jest.fn(async () => ({ source: 'admin', modules: mockDeliveryModules }));
  return { getDeliveryModulesForProgramWithFallback: (...args: unknown[]) => mockDelivery(...args) };
});

import detailHandler from '../[slug]';
import deliveryHandler from '../[slug]/delivery-modules';

function response() {
  const result: { statusCode: number; body?: any; headers: Record<string, unknown> } = {
    statusCode: 200,
    headers: {},
  };
  const res = {
    status(code: number) { result.statusCode = code; return res; },
    json(body: unknown) { result.body = body; return res; },
    setHeader(name: string, value: unknown) { result.headers[name] = value; },
  };
  return { res, result };
}

function entitlement(overrides: Record<string, unknown> = {}) {
  return {
    person_id: 'person-a', entitlement_key: 'program:gut-reset', is_active: true,
    starts_at: new Date(Date.now() - 60_000).toISOString(), ends_at: null,
    ...overrides,
  };
}

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-1', person_id: 'person-a', program_slug: 'gut-reset',
    status: 'active', active_from: null, active_to: null,
    acquisition_source: 'admin_grant', updated_at: new Date().toISOString(),
    ...overrides,
  };
}

async function callDetail() {
  const out = response();
  await detailHandler({ method: 'GET', query: { slug: 'gut-reset' } } as any, out.res as any);
  return out.result;
}

async function callDelivery() {
  const out = response();
  await deliveryHandler({ method: 'GET', query: { slug: 'gut-reset' } } as any, out.res as any);
  return out.result;
}

describe('Programs API current-access integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPersonId = 'person-a';
    mockEntitlementRows = [];
    mockAssignmentRows = [];
    mockQueryTables = [];
    mockDeliveryModules = [{ id: 'delivery-0', moduleType: 'prep', dayStart: 0, dayEnd: 0, statusVisibility: ['pre_start', 'active'] }];
    mockRequireAuth.mockResolvedValue({ userId: 'auth-a' });
    mockResolvePerson.mockImplementation(async () => mockPersonId);
  });

  test('returns published managed lessons through the signed-in detail API for a current entitlement', async () => {
    mockEntitlementRows = [entitlement()];
    const result = await callDetail();
    expect(result.statusCode).toBe(200);
    expect(result.body.managed_content.modules[0].items[0]).toMatchObject({
      title: 'Protected lesson', body: 'protected body',
    });
    expect(mockQueryTables).toEqual(expect.arrayContaining(['programs', 'program_modules', 'program_content_items']));
  });

  test('keeps authorized, in-window admin assignments working without a purchase entitlement', async () => {
    mockAssignmentRows = [assignment()];
    const result = await callDetail();
    expect(result.statusCode).toBe(200);
    expect(result.body.access_state).toBe('assigned_only');
    expect(result.body.managed_content.modules[0].items[0].body).toBe('protected body');
  });

  test.each([
    ['revoked assignment', assignment({ status: 'cancelled' })],
    ['expired assignment', assignment({ active_to: new Date(Date.now() - 60_000).toISOString() })],
    ['future assignment', assignment({ active_from: new Date(Date.now() + 60_000).toISOString() })],
  ])('does not serve managed content for a %s through the API', async (_label, row) => {
    mockAssignmentRows = [row as Record<string, unknown>];
    const result = await callDetail();
    expect(result.statusCode).toBe(404);
    expect(mockQueryTables).not.toContain('program_modules');
    expect(mockQueryTables).not.toContain('program_content_items');
  });

  test.each([
    ['revoked entitlement', entitlement({ is_active: false })],
    ['expired entitlement', entitlement({ ends_at: new Date(Date.now() - 60_000).toISOString() })],
    ['future entitlement', entitlement({ starts_at: new Date(Date.now() + 60_000).toISOString() })],
  ])('does not serve managed content for a %s through the API', async (_label, row) => {
    mockEntitlementRows = [row as Record<string, unknown>];
    const result = await callDetail();
    expect(result.statusCode).toBe(404);
    expect(mockQueryTables).not.toContain('program_modules');
    expect(mockQueryTables).not.toContain('program_content_items');
  });

  test('scopes access to the authenticated person and blocks delivery after revocation', async () => {
    mockPersonId = 'person-b';
    mockEntitlementRows = [entitlement()]; // belongs to person-a
    const detail = await callDetail();
    expect(detail.statusCode).toBe(404);

    mockQueryTables = [];
    const delivery = await callDelivery();
    expect(delivery.statusCode).toBe(404);
    expect(mockLatestVersion).not.toHaveBeenCalled();
    expect(mockDelivery).not.toHaveBeenCalled();
  });

  test('keeps valid signed-in pre-start delivery available through the API', async () => {
    mockEntitlementRows = [entitlement()];
    const result = await callDelivery();
    expect(result.statusCode).toBe(200);
    expect(result.body.modules).toEqual(mockDeliveryModules);
    expect(mockDelivery).toHaveBeenCalledWith({ programSlug: 'gut-reset', programVersionId: 'version-1' });
  });
});
