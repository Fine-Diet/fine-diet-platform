/**
 * Package 4 — plan PATCH lifecycle + DELETE forbidden contract.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const PLAN_ID = 'plan-1';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockResolveJournalTargetPerson = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
  resolveJournalTargetPerson: (...args: unknown[]) => mockResolveJournalTargetPerson(...args),
}));

const mockGetPlan = jest.fn();
const mockGetPlanDetail = jest.fn();
const mockUpdatePlan = jest.fn();
const mockDeletePlan = jest.fn();
const mockArchivePlanForPerson = jest.fn();
const mockActivatePlanForPerson = jest.fn();

jest.mock('@/lib/plans/planServerService', () => ({
  getPlan: (...args: unknown[]) => mockGetPlan(...args),
  getPlanDetail: (...args: unknown[]) => mockGetPlanDetail(...args),
  updatePlan: (...args: unknown[]) => mockUpdatePlan(...args),
  deletePlan: (...args: unknown[]) => mockDeletePlan(...args),
  archivePlanForPerson: (...args: unknown[]) => mockArchivePlanForPerson(...args),
  activatePlanForPerson: (...args: unknown[]) => mockActivatePlanForPerson(...args),
}));

import handler from '@/pages/api/journal/plans/[planId]/index';

interface MockResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string | string[] | undefined>;
}

function createMockRes(): NextApiResponse & MockResponse {
  const state: MockResponse = { statusCode: 200, body: undefined, headers: {} };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    get headers() {
      return state.headers;
    },
    status(code: number) {
      state.statusCode = code;
      return res as NextApiResponse;
    },
    json(payload: unknown) {
      state.body = payload;
      return res as NextApiResponse;
    },
    setHeader(key: string, value: string | string[]) {
      state.headers[key] = value;
      return res as NextApiResponse;
    },
  };
  return res as NextApiResponse & MockResponse;
}

function createReq(method: string, body?: unknown, planId = PLAN_ID): NextApiRequest {
  return {
    method,
    query: { planId },
    body,
    headers: {},
  } as NextApiRequest;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAuth.mockResolvedValue({ personId: CALLER_PERSON, userId: 'u1' });
  mockRequireCallerJournalAccess.mockResolvedValue(true);
  mockResolveJournalTargetPerson.mockResolvedValue(CALLER_PERSON);
});

describe('PATCH /api/journal/plans/:planId lifecycle', () => {
  it('rejects direct status mutation', async () => {
    const res = createMockRes();
    await handler(createReq('PATCH', { status: 'active' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'PLAN_STATUS_MUTATION_FORBIDDEN' });
    expect(mockUpdatePlan).not.toHaveBeenCalled();
    expect(mockActivatePlanForPerson).not.toHaveBeenCalled();
  });

  it('routes activate through activatePlanForPerson', async () => {
    mockActivatePlanForPerson.mockResolvedValue({
      id: PLAN_ID,
      status: 'active',
    });
    const res = createMockRes();
    await handler(createReq('PATCH', { action: 'activate' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockActivatePlanForPerson).toHaveBeenCalledWith(CALLER_PERSON, PLAN_ID);
    expect(mockUpdatePlan).not.toHaveBeenCalled();
  });

  it('routes archive through archivePlanForPerson and reports was_current', async () => {
    mockArchivePlanForPerson.mockResolvedValue({
      plan: { id: PLAN_ID, status: 'archived' },
      was_current: true,
    });
    const res = createMockRes();
    await handler(createReq('PATCH', { action: 'archive' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      plan: { status: 'archived' },
      was_current: true,
    });
    expect(mockArchivePlanForPerson).toHaveBeenCalledWith(CALLER_PERSON, PLAN_ID);
  });

  it('rejects inverted end_date on metadata patch', async () => {
    mockGetPlan.mockResolvedValue({
      id: PLAN_ID,
      start_date: '2026-07-12',
      end_date: '2026-07-18',
      plan_shape: 'week',
      status: 'draft',
    });
    const res = createMockRes();
    await handler(createReq('PATCH', { end_date: '2026-07-01' }), res);
    expect(res.statusCode).toBe(400);
    expect(mockUpdatePlan).not.toHaveBeenCalled();
  });

  it('allows title metadata patch without status', async () => {
    mockGetPlan.mockResolvedValue({
      id: PLAN_ID,
      start_date: '2026-07-12',
      end_date: '2026-07-18',
      plan_shape: 'week',
      status: 'draft',
    });
    mockUpdatePlan.mockResolvedValue({
      id: PLAN_ID,
      title: 'Renamed',
      status: 'draft',
    });
    const res = createMockRes();
    await handler(createReq('PATCH', { title: 'Renamed' }), res);
    expect(res.statusCode).toBe(200);
    expect(mockUpdatePlan).toHaveBeenCalledWith(CALLER_PERSON, PLAN_ID, {
      title: 'Renamed',
    });
  });

  it('rejects non-string, empty, and unsupported actions', async () => {
    for (const action of [123, '', 'retire', '  ']) {
      const res = createMockRes();
      await handler(createReq('PATCH', { action }), res);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ code: 'PLAN_ACTION_INVALID' });
      expect(mockArchivePlanForPerson).not.toHaveBeenCalled();
      expect(mockActivatePlanForPerson).not.toHaveBeenCalled();
    }
  });

  it('rejects lifecycle action mixed with metadata fields', async () => {
    const res = createMockRes();
    await handler(createReq('PATCH', { action: 'archive', title: 'Nope' }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'PLAN_ACTION_METADATA_MIXED' });
    expect(mockArchivePlanForPerson).not.toHaveBeenCalled();
    expect(mockUpdatePlan).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/journal/plans/:planId', () => {
  it.each([
    ['active-looking id', 'plan-active'],
    ['archived-looking id', 'plan-archived'],
    ['nonexistent id', 'plan-missing'],
  ])('forbids hard delete for %s without calling deletePlan', async (_label, planId) => {
    const res = createMockRes();
    await handler(createReq('DELETE', undefined, planId), res);
    expect(res.statusCode).toBe(405);
    expect(res.body).toMatchObject({ code: 'PLAN_DELETE_FORBIDDEN' });
    expect(mockDeletePlan).not.toHaveBeenCalled();
    expect(mockGetPlan).not.toHaveBeenCalled();
    // Do not disclose existence — response shape is identical for all IDs.
    expect(res.body).not.toHaveProperty('plan');
  });
});
