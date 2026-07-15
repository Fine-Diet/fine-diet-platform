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

  it('returns 502 for provider_error outcomes', async () => {
    mockSearchGroceryItemPrices.mockResolvedValue({
      provider: 'serpapi',
      search_event_id: 'event-1',
      query: 'spinach',
      retailer: 'Target',
      postal_code: '10001',
      cache_hit: false,
      outcome: 'provider_error',
      retrieved_at: '2026-07-15T00:00:00.000Z',
      expires_at: '2026-07-22T00:00:00.000Z',
      offers: [],
      quota: { remaining: 2 },
      provider_error: { code: 'timeout', message: 'SerpAPI request timed out' },
    });

    const req = {
      method: 'POST',
      query: { itemId: ITEM_ID },
      body: { retailer: 'Target', postal_code: '10001' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(502);
    expect((res.body as { outcome?: string }).outcome).toBe('provider_error');
  });

  it('returns 200 for zero_results outcomes', async () => {
    mockSearchGroceryItemPrices.mockResolvedValue({
      provider: 'serpapi',
      search_event_id: 'event-1',
      query: 'spinach',
      retailer: 'Target',
      postal_code: '10001',
      cache_hit: false,
      outcome: 'zero_results',
      retrieved_at: '2026-07-15T00:00:00.000Z',
      expires_at: '2026-07-22T00:00:00.000Z',
      offers: [],
      quota: { remaining: 2 },
      provider_error: null,
    });

    const req = {
      method: 'POST',
      query: { itemId: ITEM_ID },
      body: { retailer: 'Target', postal_code: '10001' },
    } as unknown as NextApiRequest;
    const res = createMockRes();

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect((res.body as { outcome?: string }).outcome).toBe('zero_results');
  });
});
