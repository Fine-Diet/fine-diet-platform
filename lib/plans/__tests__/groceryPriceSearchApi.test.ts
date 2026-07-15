/**
 * Route tests for grocery price search API.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

const CALLER_PERSON = 'person-caller';
const ITEM_ID = 'item-1';

const mockRequireJournalAuth = jest.fn();
const mockRequireCallerJournalAccess = jest.fn();
const mockSearchGroceryItemPrices = jest.fn();

jest.mock('@/lib/access/requireJournalAccess', () => ({
  requireJournalAuth: (...args: unknown[]) => mockRequireJournalAuth(...args),
  requireCallerJournalAccess: (...args: unknown[]) => mockRequireCallerJournalAccess(...args),
}));

jest.mock('@/lib/plans/groceryPriceServerService', () => ({
  searchGroceryItemPrices: (...args: unknown[]) => mockSearchGroceryItemPrices(...args),
  GroceryPriceValidationError: class GroceryPriceValidationError extends Error {},
  GroceryPriceQuotaExceededError: class GroceryPriceQuotaExceededError extends Error {
    quota = { remaining: 0 };
  },
}));

import handler from '@/pages/api/journal/plans/grocery-items/[itemId]/price-search';

interface MockResponse {
  statusCode: number;
  body: unknown;
  ended: boolean;
}

function createMockRes(): NextApiResponse & MockResponse {
  const state: MockResponse = { statusCode: 200, body: undefined, ended: false };
  const res = {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    get ended() {
      return state.ended;
    },
    status(code: number) {
      state.statusCode = code;
      return res as NextApiResponse;
    },
    json(payload: unknown) {
      state.body = payload;
      state.ended = true;
      return res as NextApiResponse;
    },
    setHeader: jest.fn(),
  };
  return res as NextApiResponse & MockResponse;
}

describe('price-search API route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireJournalAuth.mockResolvedValue({ personId: CALLER_PERSON });
    mockRequireCallerJournalAccess.mockResolvedValue(true);
  });

  it('rejects missing retailer before service call', async () => {
    const req = {
      method: 'POST',
      query: { itemId: ITEM_ID },
      body: { postal_code: '94110' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(mockSearchGroceryItemPrices).not.toHaveBeenCalled();
  });
});
