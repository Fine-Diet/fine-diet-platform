import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const OTHER_PERSON = 'person-other';

const mockRequireJournalAccess = jest.fn();
const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockResolveHaulViewerAccess = jest.fn();
const mockRequireHaulMemberAccess = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

jest.mock('@/lib/plans/groceryHaul/resolveHaulViewerAccess', () => ({
  resolveHaulViewerAccess: (...args: unknown[]) => mockResolveHaulViewerAccess(...args),
}));

jest.mock('@/lib/access/requireHaulAccess', () => {
  const actual = jest.requireActual<typeof import('@/lib/access/requireHaulAccess')>(
    '@/lib/access/requireHaulAccess',
  );
  return {
    ...actual,
    requireHaulMemberAccess: (...args: unknown[]) => mockRequireHaulMemberAccess(...args),
  };
});

jest.mock('@/lib/peopleService', () => ({
  logEvent: jest.fn().mockResolvedValue(undefined),
}));

import { logEvent } from '@/lib/peopleService';
import {
  DECISION_EVENT_CHANNEL,
  PEOPLE_EVENTS_COMPAT_TYPE,
} from '@/lib/plans/decisioning/events';
import { GROCERY_HAUL_EVENT_SOURCE } from '@/lib/plans/groceryHaul/events';

class GroceryListNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryListNotFoundError.prototype);
  }
}
class GroceryHaulValidationError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulValidationError.prototype);
  }
}
class GroceryHaulBlockedError extends Error {
  blockReason: string;
  constructor(blockReason: string, message: string) {
    super(message);
    this.blockReason = blockReason;
    Object.setPrototypeOf(this, GroceryHaulBlockedError.prototype);
  }
}
class GroceryHaulConflictError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulConflictError.prototype);
  }
}
class GroceryHaulForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulForbiddenError.prototype);
  }
}
class GroceryHaulNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, GroceryHaulNotFoundError.prototype);
  }
}

const mockCreateGroceryHaulFromList = jest.fn();
const mockGetGroceryHaulDetail = jest.fn();
const mockUpdateGroceryHaulMetadata = jest.fn();
const mockGetSharedGroceryHaulDetail = jest.fn();

jest.mock('@/lib/plans/groceryHaul/haulCollaboration', () => ({
  getSharedGroceryHaulDetail: (...args: unknown[]) => mockGetSharedGroceryHaulDetail(...args),
}));

jest.mock('@/lib/plans/groceryListService', () => ({
  GroceryListNotFoundError,
}));
jest.mock('@/lib/plans/groceryHaul/service', () => ({
  GroceryListNotFoundError,
  GroceryHaulValidationError,
  GroceryHaulBlockedError,
  GroceryHaulConflictError,
  GroceryHaulForbiddenError,
  GroceryHaulNotFoundError,
  createGroceryHaulFromList: (...args: unknown[]) => mockCreateGroceryHaulFromList(...args),
  getGroceryHaulDetail: (...args: unknown[]) => mockGetGroceryHaulDetail(...args),
  updateGroceryHaulMetadata: (...args: unknown[]) => mockUpdateGroceryHaulMetadata(...args),
}));

import createHandler from '@/pages/api/journal/food/grocery-lists/[listId]/hauls';
import getHandler from '@/pages/api/journal/food/hauls/[haulId]';
import sharedHandler from '@/pages/api/journal/food/hauls/[haulId]/shared';
import decisionEventsHandler from '@/pages/api/journal/decision-events';

const HAUL_ID = 'haul-1';
const AUTH_CTX = { personId: CALLER_PERSON, user: { id: 'auth-user' } };

function ownerHaulAccess() {
  mockRequireJournalAuth.mockResolvedValue(AUTH_CTX);
  mockRequireCallerJournalAccess.mockResolvedValue(true);
  mockResolveHaulViewerAccess.mockResolvedValue({
    role: 'owner',
    haulId: HAUL_ID,
    ownerPersonId: CALLER_PERSON,
    actorPersonId: CALLER_PERSON,
  });
}

const mockLogEvent = logEvent as jest.MockedFunction<typeof logEvent>;

function expectHaulDecisionLogEvent() {
  expect(mockLogEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      personId: CALLER_PERSON,
      eventType: PEOPLE_EVENTS_COMPAT_TYPE,
      source: GROCERY_HAUL_EVENT_SOURCE,
      channel: DECISION_EVENT_CHANNEL,
    }),
  );
}

interface MockResponse {
  statusCode: number;
  body: unknown;
}

function createMockRes(): NextApiResponse & MockResponse {
  const state: MockResponse = { statusCode: 200, body: undefined };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    status(code: number) {
      state.statusCode = code;
      return res as NextApiResponse;
    },
    json(payload: unknown) {
      state.body = payload;
      return res as NextApiResponse;
    },
    end() {
      return res as NextApiResponse;
    },
    setHeader: jest.fn(),
  };
  return res as NextApiResponse & MockResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAccess.mockResolvedValue({ personId: CALLER_PERSON, user: { id: 'auth-user' } });
});

describe('POST /api/journal/food/grocery-lists/:listId/hauls', () => {
  it('creates from session person and ignores smuggled person_id or item snapshots', async () => {
    mockCreateGroceryHaulFromList.mockResolvedValue({
      haul_id: 'haul-1',
      person_id: CALLER_PERSON,
      source_grocery_list_id: 'list-1',
      shopping_date: '2026-08-18',
      status: 'planned',
      creation_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      item_count: 2,
      outcome: 'created',
    });
    const req = {
      method: 'POST',
      query: { listId: 'list-1' },
      body: {
        shopping_date: '2026-08-18',
        creation_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        person_id: OTHER_PERSON,
        items: [{ name: 'Forged oats' }],
        status: 'active',
      },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await createHandler(req, res);

    expect(mockCreateGroceryHaulFromList).toHaveBeenCalledWith({
      personId: CALLER_PERSON,
      listId: 'list-1',
      shoppingDate: '2026-08-18',
      creationToken: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });
    expect(res.statusCode).toBe(201);
    expectHaulDecisionLogEvent();
    expect(mockLogEvent.mock.calls[0][0]).toEqual(
      expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'created' }) }),
    );
  });

  it('returns 200 for canonical reused open-Haul resolution', async () => {
    mockCreateGroceryHaulFromList.mockResolvedValue({
      haul_id: 'haul-existing',
      person_id: CALLER_PERSON,
      source_grocery_list_id: 'list-1',
      shopping_date: '2026-08-18',
      status: 'planned',
      creation_token: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      item_count: 1,
      outcome: 'reused',
    });
    const req = {
      method: 'POST',
      query: { listId: 'list-1' },
      body: {
        shopping_date: '2026-08-18',
        creation_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await createHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      haul: expect.objectContaining({ haul_id: 'haul-existing', outcome: 'reused' }),
    });
    expectHaulDecisionLogEvent();
    expect(mockLogEvent.mock.calls[0][0]).toEqual(
      expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'reused' }) }),
    );
  });

  it('maps blocked eligibility to 409', async () => {
    mockCreateGroceryHaulFromList.mockRejectedValue(
      new GroceryHaulBlockedError('needs_resolution', 'Resolve remaining list items before starting a shopping trip.'),
    );
    const req = {
      method: 'POST',
      query: { listId: 'list-1' },
      body: { shopping_date: '2026-08-18', creation_token: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await createHandler(req, res);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      error: 'Resolve remaining list items before starting a shopping trip.',
      block_reason: 'needs_resolution',
    });
    expectHaulDecisionLogEvent();
    expect(mockLogEvent.mock.calls[0][0]).toEqual(
      expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'blocked' }) }),
    );
  });

  it('does not allow GET on the create route', async () => {
    const req = { method: 'GET', query: { listId: 'list-1' } } as unknown as NextApiRequest;
    const res = createMockRes();
    await createHandler(req, res);
    expect(res.statusCode).toBe(405);
    expect(mockCreateGroceryHaulFromList).not.toHaveBeenCalled();
  });
});

describe('GET/PATCH /api/journal/food/hauls/:haulId (owner-only guard)', () => {
  beforeEach(() => {
    ownerHaulAccess();
  });

  it('loads the caller-owned Haul and rejects POST', async () => {
    mockGetGroceryHaulDetail.mockResolvedValue({
      haul: { id: HAUL_ID, person_id: CALLER_PERSON },
      items: [],
    });
    const getReq = { method: 'GET', query: { haulId: HAUL_ID } } as unknown as NextApiRequest;
    const getRes = createMockRes();
    await getHandler(getReq, getRes);
    expect(mockGetGroceryHaulDetail).toHaveBeenCalledWith(CALLER_PERSON, HAUL_ID);
    expect(getRes.statusCode).toBe(200);

    const postReq = { method: 'POST', query: { haulId: HAUL_ID } } as unknown as NextApiRequest;
    const postRes = createMockRes();
    await getHandler(postReq, postRes);
    expect(postRes.statusCode).toBe(405);
  });

  it('maps missing hauls to 404 after owner guard passes', async () => {
    mockGetGroceryHaulDetail.mockRejectedValue(new GroceryHaulNotFoundError('Grocery haul not found.'));
    const req = { method: 'GET', query: { haulId: 'missing' } } as unknown as NextApiRequest;
    const res = createMockRes();
    await getHandler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for accepted contributors without journal (shared fallback)', async () => {
    mockResolveHaulViewerAccess.mockResolvedValue({
      role: 'contributor',
      haulId: HAUL_ID,
      ownerPersonId: OTHER_PERSON,
      actorPersonId: CALLER_PERSON,
    });
    const req = { method: 'GET', query: { haulId: HAUL_ID } } as unknown as NextApiRequest;
    const res = createMockRes();
    await getHandler(req, res);
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Grocery haul not found.' });
    expect(mockGetGroceryHaulDetail).not.toHaveBeenCalled();
    expect(mockRequireCallerJournalAccess).not.toHaveBeenCalled();
  });

  it('returns 403 for owners without journal entitlement', async () => {
    mockRequireCallerJournalAccess.mockImplementation(async (res) => {
      res.status(403).json({ error: 'Journal access required' });
      return false;
    });
    const req = { method: 'GET', query: { haulId: HAUL_ID } } as unknown as NextApiRequest;
    const res = createMockRes();
    await getHandler(req, res);
    expect(res.statusCode).toBe(403);
    expect(mockGetGroceryHaulDetail).not.toHaveBeenCalled();
  });

  it('returns 404 for non-members', async () => {
    mockResolveHaulViewerAccess.mockResolvedValue(null);
    const req = { method: 'GET', query: { haulId: HAUL_ID } } as unknown as NextApiRequest;
    const res = createMockRes();
    await getHandler(req, res);
    expect(res.statusCode).toBe(404);
    expect(mockGetGroceryHaulDetail).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireJournalAuth.mockImplementation(async (_req, res) => {
      res.status(401).json({ error: 'Unauthorized' });
      return null;
    });
    const req = { method: 'GET', query: { haulId: HAUL_ID } } as unknown as NextApiRequest;
    const res = createMockRes();
    await getHandler(req, res);
    expect(res.statusCode).toBe(401);
    expect(mockResolveHaulViewerAccess).not.toHaveBeenCalled();
  });

  it('allows PATCH for journal-entitled owners', async () => {
    mockUpdateGroceryHaulMetadata.mockResolvedValue({ id: HAUL_ID, title: 'Updated' });
    const req = {
      method: 'PATCH',
      query: { haulId: HAUL_ID },
      body: { title: 'Updated' },
    } as unknown as NextApiRequest;
    const res = createMockRes();
    await getHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(mockUpdateGroceryHaulMetadata).toHaveBeenCalled();
  });

  it('contributor owner-endpoint 404 then shared GET succeeds', async () => {
    mockResolveHaulViewerAccess.mockResolvedValue({
      role: 'contributor',
      haulId: HAUL_ID,
      ownerPersonId: OTHER_PERSON,
      actorPersonId: CALLER_PERSON,
    });
    const ownerRes = createMockRes();
    await getHandler({ method: 'GET', query: { haulId: HAUL_ID } } as unknown as NextApiRequest, ownerRes);
    expect(ownerRes.statusCode).toBe(404);

    mockRequireHaulMemberAccess.mockResolvedValue({
      ...AUTH_CTX,
      access: {
        role: 'contributor',
        haulId: HAUL_ID,
        ownerPersonId: OTHER_PERSON,
        actorPersonId: CALLER_PERSON,
      },
    });
    mockGetSharedGroceryHaulDetail.mockResolvedValue({
      detail: { haul: { id: HAUL_ID }, items: [] },
      viewer: { role: 'contributor', person_id: CALLER_PERSON },
      contributors: [],
    });
    const sharedRes = createMockRes();
    await sharedHandler(
      { method: 'GET', query: { haulId: HAUL_ID } } as unknown as NextApiRequest,
      sharedRes,
    );
    expect(sharedRes.statusCode).toBe(200);
    expect(mockGetSharedGroceryHaulDetail).toHaveBeenCalledWith({
      actorPersonId: CALLER_PERSON,
      haulId: HAUL_ID,
    });
  });
});

describe('POST /api/journal/decision-events grocery haul', () => {
  it('logs Grocery Haul events with PEOPLE_EVENTS_COMPAT_TYPE and DECISION_EVENT_CHANNEL', async () => {
    const req = {
      method: 'POST',
      body: {
        event: 'grocery_haul_create_committed',
        policyId: 'grocery-haul-create.v1',
        policyVersion: 'v1',
        path: 'primary',
        reasonCodes: [],
        listId: 'list-1',
        haulId: 'haul-1',
        shoppingDate: '2026-08-18',
        readinessState: 'ready_to_shop',
        pendingCount: 2,
        outcome: 'created',
        blockReason: null,
      },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await decisionEventsHandler(req, res);

    expect(res.statusCode).toBe(204);
    expectHaulDecisionLogEvent();
  });
});
