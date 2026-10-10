let getDetailMock: jest.Mock;
let getDeliveryMock: jest.Mock;
let getLatestVersionMock: jest.Mock;
let getSummaryMock: jest.Mock;
let listEnrollmentsMock: jest.Mock;
let resolvePersonMock: jest.Mock;
let requireAuthMock: jest.Mock;

jest.mock('@/lib/access/requireJournalAccess', () => {
  requireAuthMock = jest.fn();
  resolvePersonMock = jest.fn();
  return {
    requireJournalAuth: (...args: unknown[]) => requireAuthMock(...args),
    resolveJournalTargetPerson: (...args: unknown[]) => resolvePersonMock(...args),
  };
});
jest.mock('@/lib/programs/programLibraryServerService', () => {
  getDetailMock = jest.fn();
  return { getLibraryDetailForPerson: (...args: unknown[]) => getDetailMock(...args) };
});
jest.mock('@/lib/programs/deliveryModuleDeliveryServerService', () => {
  getDeliveryMock = jest.fn();
  return { getDeliveryModulesForProgramWithFallback: (...args: unknown[]) => getDeliveryMock(...args) };
});
jest.mock('@/lib/programs/programRuntimeServerService', () => {
  getLatestVersionMock = jest.fn();
  getSummaryMock = jest.fn();
  listEnrollmentsMock = jest.fn();
  return {
    getLatestPublishedProgramVersionForSlug: (...args: unknown[]) => getLatestVersionMock(...args),
    getProgramRuntimeSummaryForPerson: (...args: unknown[]) => getSummaryMock(...args),
    listEnrollmentsForPerson: (...args: unknown[]) => listEnrollmentsMock(...args),
  };
});

import handler from '../[slug]/delivery-modules';

function makeResponse() {
  const res: any = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    setHeader(name: string, value: string) { this.headers[name] = value; },
  };
  return res;
}

function enrollment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'enrollment-1',
    person_id: 'person-1',
    program_slug: 'gut-reset',
    program_version_id: 'version-enrolled',
    status: 'active',
    updated_at: '2026-10-09T12:00:00Z',
    ...overrides,
  };
}

function summary(overrides: Record<string, unknown> = {}) {
  return {
    enrollment: enrollment(),
    version: { id: 'version-enrolled', status: 'published', duration_days: 21 },
    current_day: 2,
    resolved_status: 'active',
    ...overrides,
  };
}

describe('member delivery authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireAuthMock.mockResolvedValue({ userId: 'user-1' });
    resolvePersonMock.mockResolvedValue('person-1');
    getDetailMock.mockResolvedValue({ slug: 'gut-reset' });
    listEnrollmentsMock.mockResolvedValue([enrollment()]);
    getSummaryMock.mockResolvedValue(summary());
    getLatestVersionMock.mockResolvedValue({ id: 'latest-version', status: 'published' });
    getDeliveryMock.mockResolvedValue({
      source: 'admin',
      modules: [
        { id: 'day-0', dayStart: 0, statusVisibility: ['pre_start', 'active', 'paused', 'completed'] },
        { id: 'day-2', dayStart: 2, statusVisibility: ['pre_start', 'active', 'paused', 'completed'] },
        { id: 'day-3', dayStart: 3, statusVisibility: ['pre_start', 'active', 'paused', 'completed'] },
        { id: 'day-24', dayStart: 24, statusVisibility: ['pre_start', 'active', 'paused', 'completed'] },
        { id: 'always', dayStart: null, statusVisibility: ['pre_start', 'active', 'paused', 'completed'] },
        { id: 'active-only', dayStart: 1, statusVisibility: ['active'] },
      ],
    });
  });

  test('binds delivery to the person-owned enrolled version and caps future days', async () => {
    const res = makeResponse();
    await handler(
      { method: 'GET', query: { slug: 'gut-reset', version_id: 'version-enrolled' } } as any,
      res,
    );
    expect(getDeliveryMock).toHaveBeenCalledWith({
      programSlug: 'gut-reset',
      programVersionId: 'version-enrolled',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.modules.map((module: { id: string }) => module.id)).toEqual([
      'day-0', 'day-2', 'always', 'active-only',
    ]);
  });

  test('rejects a caller-selected version from another enrollment', async () => {
    const res = makeResponse();
    await handler(
      { method: 'GET', query: { slug: 'gut-reset', version_id: 'version-other' } } as any,
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(getDeliveryMock).not.toHaveBeenCalled();
  });

  test('only returns Day 0 before a start date without an enrollment', async () => {
    listEnrollmentsMock.mockResolvedValue([]);
    const res = makeResponse();
    await handler({ method: 'GET', query: { slug: 'gut-reset' } } as any, res);
    expect(getDeliveryMock).toHaveBeenCalledWith({
      programSlug: 'gut-reset',
      programVersionId: 'latest-version',
    });
    expect(res.body.modules.map((module: { id: string }) => module.id)).toEqual([
      'day-0', 'always',
    ]);
  });

  test('denies cancelled enrollments even when a catalogue entitlement remains', async () => {
    listEnrollmentsMock.mockResolvedValue([enrollment({ status: 'cancelled' })]);
    getSummaryMock.mockResolvedValue(summary({ resolved_status: 'cancelled' }));
    const res = makeResponse();
    await handler({ method: 'GET', query: { slug: 'gut-reset' } } as any, res);
    expect(res.statusCode).toBe(403);
    expect(getDeliveryMock).not.toHaveBeenCalled();
  });

  test('keeps completed members within their historical accessible day', async () => {
    getSummaryMock.mockResolvedValue(summary({
      current_day: 21,
      resolved_status: 'completed',
    }));
    const res = makeResponse();
    await handler({ method: 'GET', query: { slug: 'gut-reset' } } as any, res);
    expect(res.body.modules.map((module: { id: string }) => module.id)).toEqual([
      'day-0', 'day-2', 'day-3', 'always',
    ]);
  });
});
