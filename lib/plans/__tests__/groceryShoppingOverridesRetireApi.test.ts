import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const OVERRIDE_ID = 'override-1';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockClearUnmatchedShoppingOverride = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

jest.mock('@/lib/plans/groceryShoppingOverrideService', () => ({
  clearUnmatchedShoppingOverride: (...args: unknown[]) =>
    mockClearUnmatchedShoppingOverride(...args),
}));

import handler from '@/pages/api/journal/plans/grocery-shopping-overrides/[overrideId]';

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
    setHeader() {
      return res as NextApiResponse;
    },
    end() {
      return res as NextApiResponse;
    },
  };
  return res as NextApiResponse & MockResponse;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireJournalAuth.mockResolvedValue({
    user: { id: 'user-1', email: 'a@b.com', role: 'user' },
    personId: CALLER_PERSON,
  });
  mockRequireCallerJournalAccess.mockResolvedValue(true);
});

describe('PATCH /api/journal/plans/grocery-shopping-overrides/:overrideId', () => {
  it('retires unmatched overrides for the authenticated person only', async () => {
    mockClearUnmatchedShoppingOverride.mockResolvedValue({
      id: OVERRIDE_ID,
      match_status: 'retired',
    });
    const req = {
      method: 'PATCH',
      query: { overrideId: OVERRIDE_ID },
      body: { action: 'retire' },
      headers: {},
    } as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockClearUnmatchedShoppingOverride).toHaveBeenCalledWith({
      personId: CALLER_PERSON,
      overrideId: OVERRIDE_ID,
    });
  });
});
