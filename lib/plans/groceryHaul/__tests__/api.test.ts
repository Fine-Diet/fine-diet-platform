import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const OTHER_PERSON = 'person-other';

const mockRequireJournalAccess = jest.fn();
jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAccess: (...args: unknown[]) => mockRequireJournalAccess(...args),
}));

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
}));

import createHandler from '@/pages/api/journal/food/grocery-lists/[listId]/hauls';
import getHandler from '@/pages/api/journal/food/hauls/[haulId]';
import decisionEventsHandler from '@/pages/api/journal/decision-events';

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

describe('GET /api/journal/food/hauls/:haulId', () => {
  it('loads the caller-owned Haul and rejects POST', async () => {
    mockGetGroceryHaulDetail.mockResolvedValue({
      haul: { id: 'haul-1', person_id: CALLER_PERSON },
      items: [],
    });
    const getReq = { method: 'GET', query: { haulId: 'haul-1' } } as unknown as NextApiRequest;
    const getRes = createMockRes();
    await getHandler(getReq, getRes);
    expect(mockGetGroceryHaulDetail).toHaveBeenCalledWith(CALLER_PERSON, 'haul-1');
    expect(getRes.statusCode).toBe(200);

    const postReq = { method: 'POST', query: { haulId: 'haul-1' } } as unknown as NextApiRequest;
    const postRes = createMockRes();
    await getHandler(postReq, postRes);
    expect(postRes.statusCode).toBe(405);
  });

  it('maps missing hauls to 404', async () => {
    mockGetGroceryHaulDetail.mockRejectedValue(new GroceryHaulNotFoundError('Grocery haul not found.'));
    const req = { method: 'GET', query: { haulId: 'missing' } } as unknown as NextApiRequest;
    const res = createMockRes();
    await getHandler(req, res);
    expect(res.statusCode).toBe(404);
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
